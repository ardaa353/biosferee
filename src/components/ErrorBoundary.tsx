import { Component, type ReactNode } from "react";
import { Leaf, RefreshCw } from "lucide-react";
import { buttonClass, secondaryButton } from "./BioUI";

export default class ErrorBoundary extends Component<{children: ReactNode; resetKey?: string}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() {return {failed: true};}
  componentDidUpdate(previous: Readonly<{children: ReactNode; resetKey?: string}>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({failed: false});
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section role="alert" className="mx-auto my-12 max-w-lg rounded-2xl border border-[#09352e]/15 bg-white p-8 text-center"><Leaf className="mx-auto text-[#007f24]" size={32} /><h1 className="mt-4 font-serif text-3xl">Bu sayfa açılamadı.</h1><p className="mt-3 text-[#53675f]">Bağlantı kesilmiş veya yeni bir sürüm yayınlanmış olabilir. Sayfayı yenileyerek devam edebilirsin.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><button className={buttonClass} onClick={() => window.location.reload()}><RefreshCw size={16} />Sayfayı yenile</button><a className={secondaryButton} href="/akis">Gözlem akışı</a></div></section>;
  }
}
