# Pure data image — no runtime, just the seeded Foundry /data directory.
# Content is at the image root so --mount type=image,dst=/data lands correctly.
# Built by tests/e2e/scripts/build-seed.js.
FROM scratch
COPY . /
