"""The sheets in real iPhone Safari: the iOS Simulator (iPhone 17, the owner's phone) driven by Meta's idb.

Playwright's WebKit has no on-screen keyboard and none of iPhone Safari's own behaviour, where most layout faults
were found (DECISIONS.md, "Testing in real iPhone Safari"). This walks the sheets that broke before with the real
keyboard up, in a Safari tab and in the Home Screen app (the owner's way, which behaves differently), and saves
screenshots to test-results/ios/ to look at (CLAUDE.md, "Look before done").

Run: npm run ios-check (both), or npm run ios-check -- home (or safari). The app's preview server must be running:
npm run build && npm run preview. The Home Screen run needs the app added there once (it says how).
Needs Xcode with the iOS 27.0 simulator, and idb in ~/.local/share/idb (or $IDB_HOME): see DECISIONS.md.
"""
import json
import os
import subprocess
import sys
import time

IDB_HOME = os.environ.get('IDB_HOME', os.path.expanduser('~/.local/share/idb'))
IDB = os.path.join(IDB_HOME, 'venv', 'bin', 'idb')
COMPANION = os.path.join(IDB_HOME, 'companion', 'idb_companion')
APP = 'http://localhost:4173/life-design/'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'test-results', 'ios')
DEVICE = 'iPhone 17'


def refuse(why, then):
    sys.exit(f'ios-check: {why}\n  {then}')


def run(*args, timeout=60):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


def find_device():
    listed = run('xcrun', 'simctl', 'list', 'devices', 'available', '--json')
    if listed.returncode != 0:
        refuse('Xcode\'s simctl did not answer.', 'Install Xcode and the iOS 27.0 simulator (Xcode → Settings → Components).')
    for runtime, devices in json.loads(listed.stdout)['devices'].items():
        for d in devices:
            if d['name'] == DEVICE and 'iOS-27-0' in runtime:
                return d['udid'], d['state']
    refuse(f'no "{DEVICE}" simulator on iOS 27.0.', 'Install the iOS 27.0 simulator in Xcode → Settings → Components.')


def idb(*args):
    done = run(IDB, '--companion-path', COMPANION, *args, '--udid', UDID)
    if done.returncode != 0:
        refuse(f'idb {" ".join(args)} failed: {done.stderr.strip()[:300]}', 'Is the simulator booted and Safari in front?')
    return done.stdout


def at(x, y):
    """What's at a point on the screen (web content included), or {} if nothing."""
    done = run(IDB, '--companion-path', COMPANION, 'ui', 'describe-point', str(x), str(y), '--udid', UDID)
    if done.returncode != 0:
        if 'No accessibility element' in done.stderr:
            return {}
        refuse(f'idb describe-point failed: {done.stderr.strip()[:300]}', 'Is the simulator booted?')
    try:
        return json.loads(done.stdout)
    except json.JSONDecodeError:
        return {}


def is_web(e):
    return 'WebContent' in (e.get('traits') or [])


def find(label, top=60, bottom=800, step=10, web=None, field=False, xs_list=((201,), (120, 300))):
    """An element by its label, scanning down the screen (idb's full list has only Safari's own controls).
    web=True: the page's own element; web=False: one of iOS's (the keyboard's toolbar). field=True: a text box,
    not a heading with the same words."""
    for xs in xs_list:
        for y in range(top, bottom, step):
            for x in xs:
                e = at(x, y)
                if (e.get('AXLabel') or '').strip() == label and (web is None or is_web(e) == web) \
                        and (not field or 'TextEntry' in (e.get('traits') or [])):
                    return e['frame']
    refuse(f'"{label}" is not on the screen.', f'Look at the last screenshot in {OUT}.')


def middle(f):
    return round(f['x'] + f['width'] / 2), round(f['y'] + f['height'] / 2)


def covering(f):
    """What of iOS's own lies over a web element: its centre and four points a quarter in from each edge."""
    x, y = middle(f)
    w, h = f['width'] / 4, f['height'] / 4
    for px, py in ((x, y), (x, f['y'] + h), (x, f['y'] + 3 * h), (f['x'] + w, y), (f['x'] + 3 * w, y)):
        top = at(round(px), round(py))
        if top and not is_web(top):
            return top
    return None


def press(label):
    """Taps a sheet's button with the keyboard up, after checking a finger would reach all of it. If any of iOS
    (the keyboard's toolbar, Safari's address pill) lies over it, that's a fault: the keyboard is closed with Done
    to go on."""
    f = find(label, web=True)
    top = covering(f)
    if top:
        g = top['frame']
        FAULTS.append(f'{PREFIX}: "{label}" (y {f["y"]:.0f}-{f["y"] + f["height"]:.0f}) is partly under iOS\'s {top.get("AXLabel")!r} '
                      f'(y {g["y"]:.0f}-{g["y"] + g["height"]:.0f}) with the keyboard up')
        bar = find('Done', top=round(f['y']) - 20, bottom=round(f['y'] + f['height']) + 60, web=False, xs_list=((360, 320, 380),))
        tap(x=middle(bar)[0], y=middle(bar)[1])
        f = find(label, web=True)
    x, y = middle(f)
    tap(x=x, y=y)


def tap(label=None, x=None, y=None, field=False):
    if label:
        f = find(label, field=field)
        x, y = round(f['x'] + f['width'] / 2), round(f['y'] + f['height'] / 2)
    idb('ui', 'tap', str(x), str(y), '--duration', '0.1')  # a quick tap can land before the page listens
    time.sleep(1.2)  # past the sheet's animation and the 300 ms tap guard


def shot(name):
    path = os.path.join(OUT, f'{PREFIX}-{name}.png' if PREFIX else f'{name}.png')
    subprocess.run(['xcrun', 'simctl', 'io', UDID, 'screenshot', path], capture_output=True, check=True)
    small = path.replace('.png', '-small.png')
    subprocess.run(['sips', '-Z', '900', path, '--out', small], capture_output=True)
    SHOTS.append(small)


# ---------- Ready ----------
if not (os.path.exists(IDB) and os.path.exists(COMPANION)):
    refuse(f'idb is not in {IDB_HOME}.', 'Install it as DECISIONS.md says ("Driving the simulator": idb v1.7.6, direct download).')
if run('curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', APP).stdout != '200':
    refuse(f'the app is not at {APP}.', 'Start it first: npm run build && npm run preview')
UDID, state = find_device()
if state != 'Booted':
    run('xcrun', 'simctl', 'boot', UDID)
    run('xcrun', 'simctl', 'bootstatus', UDID, '-b', timeout=300)
os.makedirs(OUT, exist_ok=True)
SHOTS = []
FAULTS = []

def maybe(label, top, bottom, web=True):
    """An element by its label in a band of the screen, or None (no refusal)."""
    for y in range(top, bottom, 10):
        e = at(201, y)
        if (e.get('AXLabel') or '').strip() == label and is_web(e) == web:
            return e['frame']
    return None


def settle():
    """Past a "new version is ready" banner (an older build) and the first-open welcome."""
    reload = maybe('Reload', 600, 800)
    if reload:
        tap(x=middle(reload)[0], y=middle(reload)[1])
        time.sleep(4)
    skip = maybe('Skip', 60, 160)
    if skip:
        tap(x=middle(skip)[0], y=middle(skip)[1])


def open_in_safari():
    run('xcrun', 'simctl', 'openurl', UDID, APP + '#/today')
    time.sleep(4)
    settle()


def open_home_screen_app():
    """The owner's way: the app from the Home Screen (it keeps its own storage; restarted to load this build)."""
    listed = run('xcrun', 'simctl', 'spawn', UDID, 'launchctl', 'list').stdout
    for line in listed.splitlines():
        if 'com.apple.webapp' in line:
            run('xcrun', 'simctl', 'spawn', UDID, 'launchctl', 'stop', line.split()[-1])
    idb('ui', 'button', 'HOME')
    time.sleep(1.2)
    idb('ui', 'button', 'HOME')  # page 1
    time.sleep(1.2)
    for _ in range(3):
        for e in json.loads(idb('ui', 'describe-all')):
            f = e['frame']
            if (e.get('AXLabel') or '').strip() == 'Life Design' and 0 <= f['x'] + f['width'] / 2 < 402:
                idb('ui', 'tap', str(round(f['x'] + f['width'] / 2)), str(round(f['y'] + f['height'] / 2)))
                time.sleep(12)  # the web app's process starts slowly in the simulator
                settle()
                return
        idb('ui', 'swipe', '350', '550', '50', '550', '--duration', '0.3')
        time.sleep(1.2)
    refuse('"Life Design" is not on the simulator\'s Home Screen.',
           'Add it once: open the app in the simulator\'s Safari, Page Menu → Share → View More → Add to Home Screen → Add.')


def new_activity(mode):
    """New activity with the real keyboard, to Save. Screenshots and faults are named for the mode."""
    global PREFIX
    PREFIX = mode
    shot('1-today')
    tap('+ Reflect on an activity')
    shot('2-new-activity')  # the keyboard comes up by itself in the Home Screen app; in Safari only for a tap
    tap('What did you do?', field=True)
    idb('ui', 'text', 'Choir rehearsal')
    time.sleep(1)
    shot('3-what-keyboard')  # the sheet and Next above the keyboard, nothing of the page behind showing
    press('Next')
    for _ in range(3):
        tap('Skip')
    shot('4-write')
    purpose = find('Questions for')
    centre = middle(purpose)
    chosen = at(*centre).get('AXValue') or ''
    print(f'{mode}: purpose drop-down {purpose["width"]:.0f}x{purpose["height"]:.0f}pt, showing "{chosen}"')
    if purpose['height'] < 24:
        FAULTS.append(f'{mode}: the purpose drop-down is {purpose["height"]:.0f}pt tall (at least 24)')
    tap(x=centre[0], y=centre[1])
    time.sleep(1)
    shot('5-purpose-menu')  # iOS's menu, the page not zoomed
    item = find(chosen, top=round(purpose['y'] + purpose['height']), web=False)  # keep the same choice
    tap(x=middle(item)[0], y=middle(item)[1])
    tap("What's on your mind about it?", field=True)
    shot('6-write-keyboard')  # the sheet in place: the box, "Tap the mic…" and Save above the keyboard
    press('Save')
    shot('7-saved')


PREFIX = ''
modes = sys.argv[1:] or ['safari', 'home']  # npm run ios-check -- home: one mode only
try:
    for mode in modes:
        if mode == 'safari':
            open_in_safari()
        elif mode == 'home':
            open_home_screen_app()
        else:
            refuse(f'unknown mode "{mode}".', 'Use safari, home, or nothing for both.')
        new_activity(mode)
finally:
    # Never left running: a simulator left booted for hours kept the Mac's load near 300, and every e2e test then
    # timed out starting its browser (2026-10-23: 51 of 90 "failed" against a live site that was fine).
    run('xcrun', 'simctl', 'shutdown', UDID, timeout=120)
    run('pkill', '-f', 'idb_companion')

print('Look at each:')
for s in SHOTS:
    print(f'  {os.path.normpath(s)}')
if FAULTS:
    print(f'{len(FAULTS)} fault(s) in iPhone Safari:')
    for f in FAULTS:
        print(f'  - {f}')
    sys.exit(1)
print('No faults found in iPhone Safari.')
