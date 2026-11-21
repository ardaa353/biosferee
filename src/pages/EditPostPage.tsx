import { useParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { Empty, Loading, QueryError } from "@/components/BioUI";
import { ObservationForm } from "./CreatePostPage";

export default function EditPostPage() {
  const { id } = useParams();
  const postId = Number(id);
  const validId = Number.isSafeInteger(postId) && postId > 0;
  const { user } = useAuth();
  const post = trpc.biosfere.posts.get.useQuery({ id: postId }, { enabled: validId });
  if (post.isError && post.error.data?.code !== "NOT_FOUND") return <QueryError retry={() => post.refetch()} />;
  if (validId && post.isLoading) return <Loading />;
  if (!post.data || post.data.status === "removed") return <Empty title="Gönderi bulunamadı" text="Bu gözlem kaldırılmış veya bağlantı hatalı olabilir." />;
  if (post.data.author.id !== user?.id && user?.role !== "admin") return <Empty title="Düzenleme yetkiniz yok" text="Kendi gözlemlerinizi düzenleyebilirsiniz." />;
  return <ObservationForm key={post.data.id} initial={post.data} />;
}
