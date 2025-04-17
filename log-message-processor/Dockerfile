FROM python:3.6

# Crear el directorio de trabajo
WORKDIR /app

# Copiar requirements.txt antes de instalar
COPY requirements.txt .

# Instalar dependencias
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el resto del código
COPY . .

# Variables de entorno por defecto
ENV REDIS_HOST=redis
ENV REDIS_PORT=6379
ENV REDIS_CHANNEL=log_channel


# Comando por defecto
CMD ["python3", "main.py"]
