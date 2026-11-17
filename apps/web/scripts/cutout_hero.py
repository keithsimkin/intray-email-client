from collections import deque
from pathlib import Path
import colorsys

from PIL import Image

assets = Path(
    r"C:\Users\CORE i5\.cursor\projects\C-Users-CORE-i5-t3-projects-windows-unified-mail\assets"
)
out = Path(r"C:\Users\CORE i5\.t3\projects\windows-unified-mail\apps\web\public\hero")
out.mkdir(parents=True, exist_ok=True)


def soft_alpha(keep_strength: float) -> int:
    keep_strength = max(0.0, min(1.0, keep_strength))
    return int(round(keep_strength * 255))


def cut_sky_figure(src: Path, dest: Path) -> None:
    im = Image.open(src).convert("RGBA")
    px = im.load()
    w, h = im.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            h_, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            is_blue_sky = (
                0.48 <= h_ <= 0.70
                and s >= 0.18
                and v >= 0.35
                and b > r
                and b >= g - 10
            )
            is_green_haze = (
                0.28 <= h_ <= 0.48
                and s >= 0.12
                and v >= 0.45
                and g >= r
                and g >= b - 20
            )
            near_edge = x < w * 0.04 or x > w * 0.96 or y < h * 0.08

            if is_blue_sky or is_green_haze:
                sky_score = 0.0
                if is_blue_sky:
                    sky_score = min(1.0, (s - 0.18) / 0.35 + (v - 0.35) / 0.4)
                if is_green_haze:
                    sky_score = max(sky_score, min(1.0, (s - 0.12) / 0.3))
                if near_edge:
                    sky_score = min(1.0, sky_score + 0.15)
                alpha = soft_alpha(1.0 - sky_score)
                if r > 210 and g > 210 and b > 210 and abs(r - g) < 18 and abs(g - b) < 18:
                    alpha = 255
                if v < 0.35 and s < 0.45:
                    alpha = 255
                px[x, y] = (r, g, b, alpha)

    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()
    for seed in [
        (0, 0),
        (w - 1, 0),
        (0, h - 1),
        (w - 1, h - 1),
        (w // 2, 0),
        (0, h // 3),
        (w - 1, h // 3),
    ]:
        q.append(seed)

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
            continue
        visited[y][x] = True
        r, g, b, a = px[x, y]
        h_, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        skyish = (
            (0.48 <= h_ <= 0.70 and s >= 0.12 and v >= 0.35 and b >= r - 5)
            or (0.28 <= h_ <= 0.48 and s >= 0.10 and v >= 0.40 and g >= r - 5)
            or a < 200
        )
        white_cloud = (
            r > 215
            and g > 215
            and b > 215
            and abs(r - g) < 20
            and abs(g - b) < 20
            and s < 0.12
        )
        if white_cloud and a > 180:
            continue
        if not skyish and a > 220:
            continue
        px[x, y] = (r, g, b, min(a, 30) if skyish or a < 200 else a)
        if px[x, y][3] <= 40:
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                    q.append((nx, ny))

    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    im.save(dest, "PNG")
    print("figure", dest.name, im.size)


def cut_cloud_plate(src: Path, dest: Path) -> None:
    im = Image.open(src).convert("RGBA")
    px = im.load()
    w, h = im.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            avg = (r + g + b) / 3
            chroma = max(abs(r - g), abs(g - b), abs(r - b))
            if chroma < 18 and avg > 185:
                t = (avg - 185) / (255 - 185)
                alpha = soft_alpha(1.0 - min(1.0, t * 1.35))
                if avg > 235 and chroma < 12:
                    alpha = 0
                px[x, y] = (r, g, b, alpha)
            elif chroma < 22 and 150 <= avg <= 185:
                px[x, y] = (r, g, b, soft_alpha(0.15))
            else:
                px[x, y] = (r, g, b, 255)

    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque(
        [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1)]
    )
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
            continue
        visited[y][x] = True
        r, g, b, a = px[x, y]
        avg = (r + g + b) / 3
        chroma = max(abs(r - g), abs(g - b), abs(r - b))
        if a < 40 or (chroma < 25 and avg > 160):
            px[x, y] = (r, g, b, 0)
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                q.append((nx, ny))

    bbox = im.getbbox()
    if bbox:
        pad = 4
        bbox = (
            max(0, bbox[0] - pad),
            max(0, bbox[1] - pad),
            min(w, bbox[2] + pad),
            min(h, bbox[3] + pad),
        )
        im = im.crop(bbox)
    im.save(dest, "PNG")
    print("cloud", dest.name, im.size)


if __name__ == "__main__":
    cut_sky_figure(out / "cloud-laptop.jpg", out / "figure-cutout.png")
    cut_cloud_plate(assets / "cloud-a.jpg", out / "cloud-a.png")
    cut_cloud_plate(assets / "cloud-b.jpg", out / "cloud-b.png")
    print("done")
