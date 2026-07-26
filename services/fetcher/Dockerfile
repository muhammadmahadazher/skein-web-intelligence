FROM rust:1.88-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
RUN cargo build --locked --release

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=build /src/target/release/skein-fetcher /usr/local/bin/skein-fetcher
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/skein-fetcher"]
