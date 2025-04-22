# Integrantes:
- Juan Camilo Salazar
- Samuel Gutierrez


# Aplicación de Microservicios

Esta es una aplicación tomada de [bortizf](https://github.com/bortizf/microservice-app-example) basada en microservicios que están escritos en diferentes lenguajes o frameworks de programación (Go, Python, Vue, Java y NodeJS). Sobre esta se realizaron diversas modificación para implementar dos patrones cloud (API Gateway y rate limiting) y para lograr hacer un depliegue con azure con una pipeline de infraestructura y cinco de desarrollo (una para cada microservicio).

**Nota**: el taller esta dividio entre la parte de desarrollo (este repositorio) y la parte de infraestructura( [repositorio de infraestructura](https://github.com/Salazq/microservice-app-example-deployments)]

## Componentes

1. [Users API](/users-api) es una aplicación Spring Boot. Proporciona perfiles de usuario. Permite obtener un usuario individual y todos los usuarios.
2. [Auth API](/auth-api) es una aplicación en Go, y proporciona funcionalidad de autorización. Genera tokens [JWT](https://jwt.io/) para ser utilizados con otras APIs.
3. [TODOs API](/todos-api) es una aplicación NodeJS, proporciona funcionalidad CRUD sobre los registros TODOs de los usuarios. Además, registra las operaciones de "creación" y "eliminación" en una cola de [Redis](https://redis.io/).
4. [Log Message Processor](/log-message-processor) es un procesador de colas escrito en Python. Su propósito es leer mensajes de una cola Redis y mostrarlos en la salida estándar.
5. [Frontend](/frontend) aplicación Vue, proporciona la interfaz de usuario.
6. [Nginx](/nginx) Api gateway de nginx. Da acceso desde el puerto 80 hacia el frontend de la aplicación y enruta las solicitudes del frontend hacia [Auth API](/auth-api) y [TODOs API](/todos-api)

## Arquitectura

![microservice-app-example](/arch-img/Arquitectura.png)


 ## Patrones implementados:

 ### 1. API Gateway:
 La implementación se puede ver en [Nginx](/nginx) donde se encuentra el archivo de configuración con el que se levantó un contenedor de nginx que enruta las solicitudes de la aplicación:

```
server {
    listen 80;
    server_name localhost;

    location / {
        proxy_pass http://frontend:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
....
server {
    listen 8000;
    server_name localhost;

    location /login {     
        proxy_pass http://auth-api:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
...
```
Se dispusieron dos servers en diferentes puertos, el primero para el frontend y el segundo para los microservicios en back (para mayor seguridad). De esta forma el usuario accede al puerto 80 que escucha nginx y este se encarga de enrutar a la dirección puesta para el frontend, de la misma forma, el frontend se dirije a nginx cuando quiere hacer solicitudes hacia los otros microservicios y es enrutado a la dirección correcta, esta última configuración se puede ver en el [compose](Docker-compose.yml):

```
  frontend:
    build:
      context: ./frontend
    container_name: frontend
    environment:
      - PORT=8080
      # Apuntar a los servicios backend a través del puerto 8000 de Nginx
      - AUTH_API_ADDRESS=http://nginx:8000
      - TODOS_API_ADDRESS=http://nginx:8000
      - USERS_API_ADDRESS=http://nginx:8000
      - ZIPKIN_URL=http://nginx:8000
    networks:
      - app-network
```

 ### 2. Rate limiting:

Para evitar el abuso de la api dispuesta por Auth-api para el login, se implementó el patron de rate limiting también con nginx, primero se definió una [zona de limitación](nginx/rate_limit.conf) de 5 solicitudes por minutos y un error de "too many request" que se lanza cuando se excede este limite:

```
limit_req_zone $http_x_forwarded_for zone=login_limit:10m rate=5r/m;

limit_req_status 429;  # Error de  "Too Many Requests"
```

Después  se utilizo un "limit_req" con la zona de limitación anteriormente definida en el enrutamiento hacia "login", además de añadir cabeceras con la IP real (porque si no se perderían entre los enrutamientos):

```
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

location /login {
    limit_req zone=login_limit burst=3 nodelay;
   
    proxy_pass http://auth-api:8081;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

