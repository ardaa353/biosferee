FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
ARG VITE_CLOUDINARY_CLOUD_NAME
ARG VITE_CLOUDINARY_UPLOAD_PRESET
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/boot.js"]
