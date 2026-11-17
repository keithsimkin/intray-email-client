from pathlib import Path

from PIL import Image

assets = Path(
    r"C:\Users\CORE i5\.cursor\projects\C-Users-CORE-i5-t3-projects-windows-unified-mail\assets"
)
out = Path(r"C:\Users\CORE i5\.t3\projects\windows-unified-mail\apps\web\public\hero")


def key_green(src: Path, dest: Path) -> None:
    im = Image.open(src).convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # green screen: g dominant and fairly saturated
            if g > 90 and g > r * 1.25 and g > b * 1.25:
                # how green?
                greenness = min(1.0, (g - max(r, b)) / 90.0)
                alpha = int(round(255 * (1.0 - greenness)))
                if g > 180 and r < 120 and b < 120:
                    alpha = 0
                px[x, y] = (r, g, b, max(0, min(255, alpha)))
            elif g > 70 and g >= r and g >= b and (g - min(r, b)) > 35:
                greenness = min(1.0, (g - min(r, b)) / 100.0)
                alpha = int(round(255 * (1.0 - greenness * 0.9)))
                px[x, y] = (r, g, b, max(0, min(255, alpha)))

    bbox = im.getbbox()
    if bbox:
        pad = 6
        bbox = (
            max(0, bbox[0] - pad),
            max(0, bbox[1] - pad),
            min(w, bbox[2] + pad),
            min(h, bbox[3] + pad),
        )
        im = im.crop(bbox)
    im.save(dest, "PNG")
    a = im.getchannel("A")
    hist = a.histogram()
    print(dest.name, im.size, "a0", hist[0], "a255", hist[255])


if __name__ == "__main__":
    key_green(assets / "cloud-c-green.jpg", out / "cloud-a.png")
    key_green(assets / "cloud-d-green.jpg", out / "cloud-b.png")
    print("done")
