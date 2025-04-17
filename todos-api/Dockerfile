# Imagen base específica para Node 8
FROM node:8.17.0

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos del proyecto
COPY . .

# Instalar dependencias
RUN npm install

# Variables de entorno por defecto
ENV TODO_API_PORT=8082
ENV JWT_SECRET=defaultsecret
ENV REDIS_HOST=localhost
ENV REDIS_PORT=6379
ENV REDIS_CHANNEL=log_channel

# Exponer el puerto
EXPOSE 8082

# Comando para iniciar la app
CMD ["npm", "start"]
