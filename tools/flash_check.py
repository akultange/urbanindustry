"""WCAG 2.3.1 general-flash check for a filmed frame list (tools/reel_video.js writes list.txt).

Per pixel (at 160x100), a transition is a change in relative luminance of >= 0.1 whose direction
reverses the previous one (consecutive changes the same way merge), with the darker state < 0.8.
Four flashes (pairs of opposing transitions) means >= 7 transitions inside a 1 s window counts as a
failing pixel; the content fails if failing pixels cover >= 25% of any 10-degree field
(341x256 px at 1024x768, scaled to the frame) at the same time.
usage: python3 tools/flash_check.py <dir-with-list.txt> [-v]"""
import sys, os, re
import numpy as np
from PIL import Image

d = sys.argv[1]
items = re.findall(r"file '([^']+)'\nduration ([\d.]+)", open(os.path.join(d, 'list.txt')).read())
times, files, t = [], [], 0.0
for f, dur in items:
    if files and files[-1] == f: t += float(dur); continue
    times.append(t); files.append(f); t += float(dur)

def lum(path):
    a = np.asarray(Image.open(path).convert('RGB').resize((160, 100), Image.BOX)).astype(np.float32) / 255
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    return lin @ np.array([0.2126, 0.7152, 0.0722], np.float32)

L = np.stack([lum(f) for f in files])               # (n, 100, 160)
n, H, W = L.shape
# per pixel: walk the sequence, recording transition times
last_ext = L[0].copy()                               # last extreme value
last_dir = np.zeros((H, W), np.int8)
tr_mask = np.zeros((n, H, W), bool)
for k in range(1, n):
    v = L[k]
    dlt = v - last_ext
    dark_ok = np.minimum(v, last_ext) < 0.8
    up = (dlt >= 0.1) & dark_ok
    dn = (dlt <= -0.1) & dark_ok
    new_up = up & (last_dir != 1)
    new_dn = dn & (last_dir != -1)
    tr_mask[k] = new_up | new_dn
    last_dir = np.where(new_up, 1, np.where(new_dn, -1, last_dir)).astype(np.int8)
    # extremes follow the signal while it keeps going the same way, and reset on a transition
    same_up = (last_dir == 1) & (v > last_ext)
    same_dn = (last_dir == -1) & (v < last_ext)
    last_ext = np.where(new_up | new_dn | same_up | same_dn, v, last_ext)

times = np.array(times)
ww, wh = int(W * 341 / 1024), int(H * 256 / 768)
worst, worst_at, timeline = 0.0, None, []
for k0 in range(n):
    t0 = times[k0]
    sel = (times >= t0) & (times < t0 + 1.0)
    cnt = tr_mask[sel].sum(0)                        # transitions per pixel in this second
    fail = (cnt >= 7).astype(np.float32)
    # area of failing pixels in every 10-degree window (integral image)
    ii = np.pad(fail.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    area = (ii[wh:, ww:] - ii[:-wh, ww:] - ii[wh:, :-ww] + ii[:-wh, :-ww]) / (ww * wh)
    a = float(area.max())
    timeline.append((round(float(t0), 2), round(a, 3), int(cnt.max())))
    if a > worst: worst, worst_at = a, (round(float(t0), 2), int(cnt.max()))
if '-v' in sys.argv:
    print(' '.join(f'{t}:{a:.2f}/{m}' for t, a, m in timeline))
print(f'{n} distinct frames; worst failing area in a 10-degree field: {worst:.1%} at {worst_at}')
print('PASS' if worst < 0.25 else 'FAIL')
