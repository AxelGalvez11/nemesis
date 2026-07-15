import base64, pathlib
SP = pathlib.Path(__file__).resolve().parent

def uri(name, mime):
    return f"data:{mime};base64," + base64.b64encode((SP / name).read_bytes()).decode()

hero = uri("web-hero.jpg", "image/jpeg")          # owner's wireframe chrome mask (4K upscale)
intel = uri("web-intelligence.jpg", "image/jpeg")  # interlocking rings
mastery = uri("web-mastery.jpg", "image/jpeg")     # ascending spiral
obelisk = uri("web-obelisk.jpg", "image/jpeg")     # monolith — replaces mask emblem
lattice = uri("web-lattice.jpg", "image/jpeg")     # sphere lattice — the graph band
plates = uri("web-plates.jpg", "image/jpeg")       # plates aligning — the order band
logo = uri("web-logo.png", "image/png")

HTML = f"""<style>
  :root {{
    --ink:#080809; --ink2:#0d0d0f; --panel:#111114;
    --chrome:#e7e9ed; --steel:#9a9da4; --iron:#5a5c63; --faint:#2a2b30;
    --blood:#ff2740; --blood-deep:#b3121f;
    --line:rgba(255,255,255,.07); --line-2:rgba(255,255,255,.12);
    --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
    --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  }}
  * {{ box-sizing:border-box; }}
  .nem-root {{ background:var(--ink); color:var(--steel); font-family:var(--sans); line-height:1.55;
    -webkit-font-smoothing:antialiased; overflow-x:hidden; }}
  .nem-root ::selection {{ background:var(--blood); color:#fff; }}
  .wrap {{ max-width:1180px; margin:0 auto; padding:0 28px; }}
  .hero .wrap, .band .wrap {{ width:100%; }}
  .eyebrow {{ font-family:var(--mono); font-size:11px; letter-spacing:.22em; text-transform:uppercase;
    color:var(--iron); margin:0; }}
  .eyebrow .dot {{ color:var(--blood); }}
  h1,h2,h3 {{ color:var(--chrome); font-weight:600; text-wrap:balance; margin:0; }}

  /* nav */
  .nav {{ position:sticky; top:0; z-index:20; backdrop-filter:blur(10px);
    background:linear-gradient(to bottom,rgba(8,8,9,.92),rgba(8,8,9,.6));
    border-bottom:1px solid var(--line); }}
  .nav-in {{ display:flex; align-items:center; gap:22px; height:56px; }}
  .brand {{ display:flex; align-items:center; gap:11px; }}
  .brand img {{ width:26px; height:26px; object-fit:contain; }}
  .brand b {{ color:var(--chrome); font-weight:600; letter-spacing:.34em; font-size:13px;
    text-transform:uppercase; font-family:var(--mono); padding-left:2px; }}
  .nav .spacer {{ flex:1; }}
  .nav a.ghost {{ color:var(--steel); text-decoration:none; font-family:var(--mono); font-size:11px;
    letter-spacing:.12em; text-transform:uppercase; }}
  .nav a.ghost:hover {{ color:var(--chrome); }}
  .btn {{ display:inline-flex; align-items:center; gap:8px; font-family:var(--mono); font-size:12px;
    letter-spacing:.12em; text-transform:uppercase; text-decoration:none; padding:11px 20px;
    border-radius:2px; transition:transform .15s ease, background .15s ease, border-color .15s ease; }}
  .btn-primary {{ background:var(--blood); color:#fff; border:1px solid var(--blood); }}
  .btn-primary:hover {{ background:#e01732; transform:translateY(-1px); }}
  .btn-ghost {{ color:var(--chrome); border:1px solid var(--line-2); background:transparent; }}
  .btn-ghost:hover {{ border-color:var(--steel); }}

  /* hero — square art anchored right, black-on-black blend */
  .hero {{ position:relative; min-height:92vh; display:flex; align-items:center;
    border-bottom:1px solid var(--line); overflow:hidden; }}
  .hero-art {{ position:absolute; top:50%; transform:translateY(calc(-50% + var(--par,0px))); right:-3vw;
    height:104%; aspect-ratio:1/1; background-image:url('{hero}');
    background-size:cover; background-position:center; will-change:transform; }}
  .hero-veil {{ position:absolute; inset:0;
    background:linear-gradient(90deg,var(--ink) 24%,rgba(8,8,9,.7) 46%,rgba(8,8,9,.06) 72%,rgba(8,8,9,.3) 100%); }}
  .hero-in {{ position:relative; padding:60px 0; max-width:820px; }}
  .hero h1 {{ font-size:clamp(64px,10.5vw,148px); line-height:.92; letter-spacing:-.035em;
    font-weight:800; margin:18px 0 0; text-transform:uppercase; }}
  .hero .phrase {{ font-family:var(--mono); font-size:clamp(12px,1.2vw,15px); letter-spacing:.3em;
    text-transform:uppercase; color:var(--steel); margin:26px 0 0; }}
  .hero .phrase .dot {{ color:var(--blood); }}
  .hero-cta {{ display:flex; gap:14px; margin-top:34px; flex-wrap:wrap; }}
  .hero-meta {{ margin-top:30px; font-family:var(--mono); font-size:11px; letter-spacing:.06em;
    color:var(--iron); display:flex; align-items:center; gap:10px; }}
  .hero-meta .rule {{ width:26px; height:1px; background:var(--faint); }}

  /* section shell */
  .section {{ padding:128px 0; border-bottom:1px solid var(--line); }}
  .section.alt {{ background:var(--ink2); }}
  .section-head {{ max-width:640px; margin-bottom:52px; }}
  .section-head h2 {{ font-size:clamp(30px,4vw,48px); letter-spacing:-.03em; margin-top:14px; line-height:1.04; font-weight:700; }}
  .section-head p {{ color:var(--steel); margin:16px 0 0; font-size:16px; }}

  /* triad */
  .triad {{ display:grid; grid-template-columns:repeat(3,1fr); gap:22px; }}
  .obj {{ border:1px solid var(--line); border-radius:2px; background:#000; overflow:hidden;
    transition:border-color .25s ease; }}
  .obj:hover {{ border-color:var(--line-2); }}
  .obj .img {{ aspect-ratio:1/1; background-size:cover; background-position:center; }}
  .obj .cap {{ padding:22px 22px 26px; }}
  .obj .k {{ font-family:var(--mono); font-size:11px; letter-spacing:.2em; text-transform:uppercase;
    color:var(--blood); }}
  .obj h3 {{ font-size:21px; margin:9px 0 8px; letter-spacing:-.01em; }}
  .obj p {{ font-size:14.5px; color:var(--steel); margin:0; }}

  /* the three answers */
  .qs {{ display:grid; grid-template-columns:repeat(3,1fr); gap:0; border:1px solid var(--line);
    border-radius:2px; overflow:hidden; }}
  .q {{ padding:34px 30px; border-right:1px solid var(--line); }}
  .q:last-child {{ border-right:none; }}
  .q .n {{ font-family:var(--mono); font-size:12px; color:var(--iron); letter-spacing:.1em; }}
  .q h3 {{ font-size:21px; margin:16px 0 10px; letter-spacing:-.01em; }}
  .q p {{ font-size:14.5px; color:var(--steel); margin:0; }}
  .q h3 .b {{ color:var(--blood); }}

  /* full-width image bands */
  .band {{ position:relative; min-height:54vh; display:flex; align-items:center;
    border-bottom:1px solid var(--line); overflow:hidden; }}
  .band-art {{ position:absolute; inset:0; background-size:cover; background-position:center;
    background-attachment:fixed; }}
  .band-veil {{ position:absolute; inset:0;
    background:linear-gradient(90deg,var(--ink) 22%,rgba(8,8,9,.82) 48%,rgba(8,8,9,.12) 80%); }}
  .band-in {{ position:relative; padding:88px 0; max-width:520px; }}
  .band h2 {{ font-size:clamp(28px,3.8vw,46px); letter-spacing:-.03em; line-height:1.04; margin-top:14px; font-weight:700; }}
  .band p {{ color:var(--steel); margin:16px 0 0; font-size:15.5px; max-width:28em; }}

  /* capability rows */
  .caps {{ display:grid; grid-template-columns:repeat(2,1fr); gap:1px; background:var(--line);
    border:1px solid var(--line); border-radius:2px; overflow:hidden; }}
  .cap {{ background:var(--ink); padding:28px 30px; }}
  .cap .k {{ font-family:var(--mono); font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--iron); }}
  .cap h3 {{ font-size:18px; margin:10px 0 7px; }}
  .cap p {{ font-size:14px; color:var(--steel); margin:0; }}

  /* trust */
  .trust {{ display:flex; align-items:center; gap:18px; flex-wrap:wrap;
    border:1px solid var(--line); border-left:2px solid var(--blood); border-radius:2px;
    padding:26px 30px; background:var(--ink2); }}
  .trust .lock {{ font-family:var(--mono); color:var(--blood); font-size:12px; letter-spacing:.14em;
    text-transform:uppercase; white-space:nowrap; }}
  .trust p {{ margin:0; font-size:15px; color:var(--chrome); }}
  .trust p span {{ color:var(--steel); }}

  /* closer */
  .closer {{ padding:120px 0; text-align:center; }}
  .closer h2 {{ font-size:clamp(30px,4.2vw,50px); letter-spacing:-.03em; font-weight:700; line-height:1.08; margin:0 auto; max-width:16em; }}
  .closer p {{ color:var(--steel); margin:20px auto 34px; max-width:32em; }}
  /* legal panels — hidden until targeted from the footer */
  .legal {{ display:none; padding:88px 0; border-bottom:1px solid var(--line); background:var(--ink2); }}
  .legal:target {{ display:block; }}
  .legal .inner {{ max-width:720px; }}
  .legal h2 {{ font-size:clamp(24px,3vw,34px); letter-spacing:-.02em; margin-top:12px; }}
  .legal h3 {{ font-size:16px; margin:28px 0 8px; }}
  .legal p, .legal li {{ font-size:14.5px; color:var(--steel); }}
  .legal ul {{ margin:8px 0 0; padding-left:18px; }}
  .legal .back {{ display:inline-block; margin-top:30px; font-family:var(--mono); font-size:12px;
    letter-spacing:.12em; text-transform:uppercase; color:var(--blood); text-decoration:none; }}
  .legal .stamp {{ font-family:var(--mono); font-size:11px; letter-spacing:.08em; color:var(--iron); margin:14px 0 0; }}
  .foot {{ border-top:1px solid var(--line); padding:48px 0 40px; }}
  .foot a {{ color:var(--iron); text-decoration:none; font-family:var(--mono); font-size:12px; letter-spacing:.06em; }}
  .foot a:hover {{ color:var(--steel); }}
  .foot-in {{ display:flex; align-items:center; gap:14px; flex-wrap:wrap; }}
  .foot .muted {{ color:var(--iron); font-size:12.5px; font-family:var(--mono); letter-spacing:.04em; }}
  .foot .spacer {{ flex:1; }}

  .reveal {{ animation:rise .8s cubic-bezier(.2,.7,.2,1) both; }}
  .r2 {{ animation-delay:.08s; }} .r3 {{ animation-delay:.16s; }} .r4 {{ animation-delay:.24s; }}
  @keyframes rise {{ from {{ transform:translateY(14px); }} to {{ transform:none; }} }}
  @media (prefers-reduced-motion:reduce) {{ .reveal {{ animation:none; }}
    .band-art {{ background-attachment:scroll; }} }}

  @media (max-width:820px) {{
    .triad {{ grid-template-columns:1fr; }} .qs {{ grid-template-columns:1fr; }}
    .q {{ border-right:none; border-bottom:1px solid var(--line); }} .q:last-child {{ border-bottom:none; }}
    .caps {{ grid-template-columns:1fr; }}
    .hero-art {{ height:88%; right:-34vw; opacity:.8; }}
    .hero-veil {{ background:linear-gradient(180deg,rgba(8,8,9,.42),rgba(8,8,9,.88)); }}
    .band-veil {{ background:linear-gradient(180deg,rgba(8,8,9,.5),rgba(8,8,9,.88)); }}
    .band-art {{ background-attachment:scroll; }}
    .nav a.ghost {{ display:none; }}
  }}
</style>

<h2 class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);">Nemesis — academic operating system for macOS. It reads your school accounts, tracks every deadline and change, measures what you know, and drafts your work. It never submits.</h2>

<div class="nem-root">
  <nav class="nav"><div class="wrap nav-in">
    <span class="brand"><img src="{logo}" alt="Nemesis logo"><b>Nemesis</b></span>
    <span class="spacer"></span>
    <a class="ghost" href="#how">System</a>
    <a class="ghost" href="#graph">The graph</a>
    <a class="ghost" href="#privacy">Privacy</a>
    <a class="btn btn-primary" href="#get">Get Nemesis</a>
  </div></nav>

  <header class="hero">
    <div class="hero-art"></div><div class="hero-veil"></div>
    <div class="wrap"><div class="hero-in">
      <p class="eyebrow reveal">Academic operating system<span class="dot"> · </span>macOS</p>
      <h1 class="reveal r2">Nemesis</h1>
      <p class="phrase reveal r3">Intelligence<span class="dot"> · </span>Precision<span class="dot"> · </span>Relentless</p>
      <div class="hero-cta reveal r4">
        <a class="btn btn-primary" href="#get">Get Nemesis</a>
        <a class="btn btn-ghost" href="#how">Watch it work</a>
      </div>
      <div class="hero-meta reveal r4"><span>macOS</span><span class="rule"></span><span>on-device</span><span class="rule"></span><span>never submits</span></div>
    </div></div>
  </header>

  <section class="section alt" id="how"><div class="wrap">
    <div class="section-head">
      <p class="eyebrow">The product</p>
      <h2>A student needs three answers. Nemesis keeps them current.</h2>
    </div>
    <div class="qs">
      <div class="q"><div class="n">01</div><h3>It knows what <span class="b">changed</span>.</h3><p>Announcements, moved exams, new grades, new files. It reads them and reports the difference. Nothing slips.</p></div>
      <div class="q"><div class="n">02</div><h3>It knows what comes <span class="b">next</span>.</h3><p>Open work, ranked by deadline, grade weight, and how well you know the material. One task on top. A reason attached.</p></div>
      <div class="q"><div class="n">03</div><h3>It knows what you <span class="b">don't</span>.</h3><p>Recall tracked per concept. It flags what will cost you, weeks before the exam.</p></div>
    </div>
  </div></section>

  <section class="section"><div class="wrap">
    <div class="section-head">
      <p class="eyebrow">Mastery<span class="dot"> · </span>Intelligence<span class="dot"> · </span>Nemesis</p>
      <h2>Three functions. Nothing else.</h2>
      <p>Every capability serves one of these.</p>
    </div>
    <div class="triad">
      <div class="obj"><div class="img" style="background-image:url('{intel}')"></div>
        <div class="cap"><div class="k">Intelligence</div><h3>It knows your semester</h3>
        <p>It reads your accounts and builds one model: courses, deadlines, lectures, concepts. Every fact carries its source. A professor's word never blurs into a guess.</p></div></div>
      <div class="obj"><div class="img" style="background-image:url('{mastery}')"></div>
        <div class="cap"><div class="k">Mastery</div><h3>It measures what you know</h3>
        <p>Not card counts. Recall, per concept, tracked over time. It schedules review right before you forget and names where you are weak.</p></div></div>
      <div class="obj"><div class="img" style="background-image:url('{obelisk}')"></div>
        <div class="cap"><div class="k">Nemesis</div><h3>It does the work around learning</h3>
        <p>It watches your portals, files your materials, keeps your calendar, drafts your documents. It never submits. That part is yours.</p></div></div>
    </div>
  </div></section>

  <div class="band" id="graph">
    <div class="band-art" style="background-image:url('{lattice}')"></div><div class="band-veil"></div>
    <div class="wrap"><div class="band-in">
      <p class="eyebrow">The graph</p>
      <h2>One model of your semester.</h2>
      <p>Courses, deadlines, lectures, grades, concepts. Every fact carries its source and its history. Ask it anything about your semester; it answers from record, not memory.</p>
    </div></div>
  </div>

  <section class="section"><div class="wrap">
    <div class="section-head"><p class="eyebrow">Capabilities</p><h2>What it does.</h2></div>
    <div class="caps">
      <div class="cap"><div class="k">Lectures</div><h3>Records and transcribes on-device</h3><p>Lectures become notes, mind maps, decks, and practice tests. Transcription runs on your Mac. The audio stays there.</p></div>
      <div class="cap"><div class="k">Accounts</div><h3>Reads Blackboard, Outlook, Canvas, Gmail</h3><p>You sign in once, in its browser, on your machine. No API keys. It checks your portals so you don't have to.</p></div>
      <div class="cap"><div class="k">Study</div><h3>Schedules review by recall</h3><p>Decks, mind maps, and tests per section. It queues each concept right before you would forget it.</p></div>
      <div class="cap"><div class="k">Documents</div><h3>Drafts. Never submits.</h3><p>Slides, reports, and handouts with real citations. You review. You submit. There is no code path for it to do that.</p></div>
    </div>
    <div class="trust" id="privacy" style="margin-top:26px;">
      <span class="lock">Local-first</span>
      <p>Logins stay on your Mac. Audio stays on your Mac. <span>It sends nothing and submits nothing without you.</span></p>
    </div>
  </div></section>

  <div class="band">
    <div class="band-art" style="background-image:url('{plates}');background-position:76% center;"></div><div class="band-veil"></div>
    <div class="wrap"><div class="band-in">
      <p class="eyebrow">Files<span class="dot"> · </span>Calendar<span class="dot"> · </span>Inbox</p>
      <h2>Order is maintained.</h2>
      <p>Notes filed. Decks current. Calendar true. Every action it takes is logged in plain English.</p>
    </div></div>
  </div>

  <section class="closer" id="get"><div class="wrap">
    <p class="eyebrow" style="text-align:center;margin-bottom:18px;">After graduation</p>
    <h2>It starts with school. It does not end there.</h2>
    <p>Nemesis keeps your knowledge, projects, and record. It follows you into residency, research, and work.</p>
    <a class="btn btn-primary" href="#" style="font-size:13px;padding:14px 30px;">Get Nemesis for Mac</a>
  </div></section>

  <section class="legal" id="privacy-policy"><div class="wrap"><div class="inner">
    <p class="eyebrow">Legal<span class="dot"> · </span>Privacy</p>
    <h2>Privacy policy</h2>
    <p class="stamp">Effective July 2026</p>
    <h3>What stays on your Mac</h3>
    <p>Nemesis is local-first. Your course files, notes, lecture recordings, transcripts, flashcards, calendar, and the academic record it builds are stored on your device. Lecture audio is transcribed on your Mac and is not uploaded. Your school and email logins are entered in Nemesis's own browser on your device; we never see or store those credentials.</p>
    <h3>What we collect</h3>
    <ul>
      <li>Account information: the email address you sign up with and your subscription status.</li>
      <li>Metering: counts of assistant usage (not the content) to enforce plan limits.</li>
      <li>Payments are processed by our payment provider; we do not store card numbers.</li>
    </ul>
    <h3>When content leaves your device</h3>
    <p>When you ask the assistant a question, that request (and the context you attach to it) is sent to our model provider to generate the answer, then used for nothing else. Nemesis does not send email, submit coursework, or upload your library.</p>
    <h3>What we never do</h3>
    <ul>
      <li>No selling or sharing of personal data.</li>
      <li>No advertising and no ad tracking.</li>
      <li>No training on your content.</li>
    </ul>
    <h3>Deletion</h3>
    <p>Delete your account and we delete the account records we hold. Everything local is already yours: it lives in your files and stays there.</p>
    <p>Questions: support@nemesis.app</p>
    <a class="back" href="#">Close</a>
  </div></div></section>

  <section class="legal" id="terms"><div class="wrap"><div class="inner">
    <p class="eyebrow">Legal<span class="dot"> · </span>Terms</p>
    <h2>Terms of use</h2>
    <p class="stamp">Effective July 2026</p>
    <h3>The license</h3>
    <p>Nemesis is licensed to you personally, for your own studies. Don't resell it, share your account, or reverse-engineer the service.</p>
    <h3>Academic integrity</h3>
    <p>Nemesis produces drafts and study material. It has no ability to submit coursework, and it never sends anything on your behalf. What you submit — and whether it complies with your institution's policies — is your decision and your responsibility. Use Nemesis in the way your school permits.</p>
    <h3>Your accounts</h3>
    <p>You connect your school portals and email by signing in yourself, on your device. You are responsible for having the right to access the accounts you connect.</p>
    <h3>Subscriptions</h3>
    <p>Paid plans bill through our payment provider until you cancel. Cancel any time; access continues through the period you paid for.</p>
    <h3>No warranty</h3>
    <p>Nemesis is provided as-is. We work to keep it accurate and dependable, but we do not guarantee it is error-free, and you should verify anything that matters — grades, deadlines, and citations included.</p>
    <h3>Liability</h3>
    <p>To the maximum extent the law allows, our liability is limited to the amount you paid for the service in the twelve months before a claim.</p>
    <h3>Changes</h3>
    <p>If these terms change materially, we will tell you in the app before the change takes effect.</p>
    <p>Questions: support@nemesis.app</p>
    <a class="back" href="#">Close</a>
  </div></div></section>

  <div class="foot"><div class="wrap foot-in">
    <span class="brand"><img src="{logo}" alt="" style="width:20px;height:20px;"><b style="font-size:11px;">Nemesis</b></span>
    <a href="#privacy-policy">Privacy</a>
    <a href="#terms">Terms</a>
    <a href="mailto:support@nemesis.app">Contact</a>
    <span class="spacer"></span>
    <span class="muted">local-first · never submits · macOS</span>
  </div></div>
</div>

<script>
(function () {{
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var art = document.querySelector('.hero-art');
  if (!art) return;
  var ticking = false;
  function onScroll() {{
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {{
      art.style.setProperty('--par', (window.scrollY * 0.14).toFixed(1) + 'px');
      ticking = false;
    }});
  }}
  window.addEventListener('scroll', onScroll, {{ passive: true }});
}})();
</script>"""

out = SP.parent / "nemesis-landing.html"
out.write_text(HTML)
print("wrote", out, f"{len(HTML)//1024} KB")
