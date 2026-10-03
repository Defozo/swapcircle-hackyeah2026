# Adapted from the Superteam course supplied in the official challenge brief:
# https://github.com/matzayonc/solana-live-course-2026/tree/5c3cfe8ce036cdef9c91298c3935763d2b2412aa
# Pin the exact verified-build image. Its bundled Anchor 1.1.2, Agave 3.1.10,
# Rust 1.96.0 and platform-tools are the toolchain used for the accepted build.
FROM quay.io/ottersec/anchor:v1.1.2@sha256:4ef4cf067fb1332ddd2b997a48ed05257854f51067ade342d63ebdc1039fe72e
ARG NODE_VERSION=24.14.1
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
    && rm /tmp/node.tar.xz \
    && /usr/local/bin/npm install -g corepack@0.34.6 \
    && /usr/local/bin/corepack enable \
    && /usr/local/bin/corepack prepare pnpm@10.33.0 --activate
ENV PATH=/usr/local/bin:$PATH
EXPOSE 5173 8899 8900
WORKDIR /workspace
