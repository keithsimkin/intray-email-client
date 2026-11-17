"""
Remove solid black backdrop from hero-cloud for sky compositing.

Preserve dark hair: grow the subject from colorful / bright seeds first,
then only clear near-black pixels that are NOT connected to the subject.
"""
from __future__ import annotations

from collections import deque

from PIL import Image

SRC = r"C:\Users\CORE i5\.t3\projects\windows-unified-mail\apps\web\public\hero\hero-cloud-src.png"
DST = r"C:\Users\CORE i5\.t3\projects\windows-unified-mail\apps\web\public\hero\hero-cloud.png"


def lum(c: tuple[int, int, int, int]) -> float:
    r, g, b, _ = c
    return (r + g + b) / 3.0


def chroma(c: tuple[int, int, int, int]) -> int:
    r, g, b, _ = c
    return max(r, g, b) - min(r, g, b)


def is_subject_seed(c: tuple[int, int, int, int]) -> bool:
    """Bright / colorful / skintone pixels that are definitely the figure."""
    r, g, b, a = c
    if a < 40:
        return False
    L = lum(c)
    ch = chroma(c)
    if L >= 55:
        return True
    if ch >= 28 and L >= 25:
        return True
    # warm skin / brown tones
    if r > g + 8 and r > b + 8 and L >= 30:
        return True
    return False


def is_near_black(c: tuple[int, int, int, int], tol: float = 22) -> bool:
    r, g, b, a = c
    if a < 8:
        return True
    if chroma(c) > 18:
        return False
    return lum(c) <= tol


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    px = im.load()

    # 1) Grow subject from colorful/bright seeds through ANY opaque pixel
    #    (this keeps black hair attached to the face / cloud / wings).
    subject = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()
    for y in range(h):
        for x in range(w):
            if is_subject_seed(px[x, y]):
                subject[y][x] = True
                q.append((x, y))

    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not subject[ny][nx]:
                r, g, b, a = px[nx, ny]
                if a > 20:
                    subject[ny][nx] = True
                    q.append((nx, ny))

    subject_px = sum(1 for y in range(h) for x in range(w) if subject[y][x])

    # 2) Flood near-black background from edges, never into subject.
    visited = [[False] * w for _ in range(h)]
    bq: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not subject[y][x] and is_near_black(px[x, y], 28):
                visited[y][x] = True
                bq.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y][x] and not subject[y][x] and is_near_black(px[x, y], 28):
                visited[y][x] = True
                bq.append((x, y))

    cleared = 0
    while bq:
        x, y = bq.popleft()
        c = px[x, y]
        L = lum(c)
        if L <= 18 or c[3] < 40:
            px[x, y] = (0, 0, 0, 0)
        else:
            alpha = int(max(0, min(255, (L - 18) / 20 * 255)))
            r, g, b, _ = c
            px[x, y] = (r, g, b, alpha if alpha > 16 else 0)
        cleared += 1
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] and not subject[ny][nx]:
                if is_near_black(px[nx, ny], 36):
                    visited[ny][nx] = True
                    bq.append((nx, ny))

    # 3) Drop tiny stray smudges not attached to the main subject blob.
    labels = [[-1] * w for _ in range(h)]
    comps: list[list[tuple[int, int]]] = []
    for y in range(h):
        for x in range(w):
            if labels[y][x] != -1 or px[x, y][3] <= 20:
                continue
            idx = len(comps)
            blob: list[tuple[int, int]] = []
            qq: deque[tuple[int, int]] = deque([(x, y)])
            labels[y][x] = idx
            while qq:
                cx, cy = qq.popleft()
                blob.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < w and 0 <= ny < h and labels[ny][nx] == -1 and px[nx, ny][3] > 20:
                        labels[ny][nx] = idx
                        qq.append((nx, ny))
            comps.append(blob)

    dropped = 0
    if comps:
        main_idx = max(range(len(comps)), key=lambda i: len(comps[i]))
        for i, blob in enumerate(comps):
            if i == main_idx:
                continue
            if len(blob) < int(w * h * 0.01):
                for x, y in blob:
                    px[x, y] = (0, 0, 0, 0)
                dropped += len(blob)

    # 4) Clean translucent dark fringe only OUTSIDE subject
    fringe = 0
    for y in range(h):
        for x in range(w):
            if subject[y][x]:
                continue
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            L = (r + g + b) / 3.0
            if a < 120 and L < 55 and chroma((r, g, b, a)) <= 20:
                px[x, y] = (0, 0, 0, 0)
                fringe += 1

    im.save(DST, optimize=True)
    top = next(
        (y for y in range(h) for x in range(w) if px[x, y][3] > 20),
        None,
    )
    print(
        f"subject={subject_px} cleared={cleared} fringe={fringe} dropped={dropped} "
        f"top_opaque={top} → {DST} ({w}x{h})"
    )


if __name__ == "__main__":
    main()
