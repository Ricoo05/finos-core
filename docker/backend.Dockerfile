FROM maven:3-eclipse-temurin-21@sha256:d49bca545509b98965a808175862337dfdd24e1a8a4b11005cc8ce0578e52e8c AS build
WORKDIR /build
COPY backend/pom.xml pom.xml
COPY backend/src src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre-noble@sha256:0eda5830ed7b669abc246a8dc520ea8a23cab06f9a8d4b6964109e2f2394e46f
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* && useradd --system --uid 10001 app
WORKDIR /app
COPY --from=build /build/target/ledger-0.1.0.jar app.jar
USER 10001
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 CMD curl --fail --silent http://127.0.0.1:8080/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
