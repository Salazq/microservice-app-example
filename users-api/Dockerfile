FROM maven:3.8-openjdk-8 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn clean package -DskipTests

FROM openjdk:8-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/users-api-0.0.1-SNAPSHOT.jar ./app.jar
CMD ["java", "-jar", "app.jar"]

# The following command can be used to build and run the Docker container:
#docker build -t users-api ./users-api
#docker run --network app-network --name users-api -p 8083:8083 -e JWT_SECRET=PRFT -e SERVER_PORT=8083 users-api