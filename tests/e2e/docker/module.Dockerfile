# Pure module data image — overlaid at /data/Data/modules/simulacrum at test time.
# Content is at the image root so --mount type=image,dst=<path> lands correctly.
# Built by tests/e2e/scripts/build-seed.js.
FROM scratch
COPY . /
