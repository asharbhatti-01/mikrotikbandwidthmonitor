# ---- Development ----
FROM node:22-alpine AS dev
WORKDIR /app/apps/web
COPY docker/web/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]

# ---- Production / Staging ----
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
