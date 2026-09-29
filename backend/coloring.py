from typing import Iterable, Dict
import colorsys


#for matching the colors of graph nodes to the colors of node labels showing in the data base information inspector
GOLDEN_ANGLE = 137.50776405003785

# Fowler–Noll–Vo technique
def fnv1a_32(s: str) -> int:
    data = s.encode("utf-8")
    h = 0x811C9DC5 # hash value - just a magic starting constant
    for b in data:
        h ^= b # XOR - "mixes in" the bytes according to string bytes
        h = (h * 0x01000193) & 0xFFFFFFFF #explode it across all bits  (multiply with prime) & trim back to 32 bits (mask) by keeping the LOWEST (rightmost) 32 bits
    return h

def hue_distance(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return min(d, 360 - d)

def hsl_to_hex(h: float, s: float, l: float) -> str:
    # colorsys is HLS (not HSL): h, l, s in [0..1]
    r, g, b = colorsys.hls_to_rgb(h / 360.0, l / 100.0, s / 100.0)
    return "#{:02x}{:02x}{:02x}".format(int(r * 255), int(g * 255), int(b * 255))

# min_hue_gap -> minimum angular distance (in degrees) between any two assigned hues on the 360° color wheel
def build_label_color_map(labels: Iterable[str], min_hue_gap: float = 30) -> Dict[str, str]:
    unique = sorted({str(x) for x in labels})
    used_hues = []
    out = {}

    for label in unique:
        x = fnv1a_32(label)

        hue = x % 360
        sat = 60 + ((x >> 8) % 25)      # 60–84
        light = 22 + ((x >> 16) % 14)   # 22–35 (dark)

        guard = 0
        while any(hue_distance(hue, u) < min_hue_gap for u in used_hues) and guard < 80:
            hue = (hue + GOLDEN_ANGLE) % 360
            guard += 1
            
        # jitter sat and light so near-hue labels still look different
        sat_jitter   = ((x >> 4)  % 3) * 10   # 0, 10, or 20 → widens sat spread
        light_jitter = ((x >> 12) % 3) * 8    # 0, 8, or 16  → widens light spread

        sat   = 55 + sat_jitter + ((x >> 8) % 15)   # 55–79
        light = 20 + light_jitter + ((x >> 16) % 10) # 20–53

        used_hues.append(hue)
        out[label] = hsl_to_hex(hue, sat, light)  # HEX

    return out
