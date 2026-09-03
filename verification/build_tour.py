import base64, os, html

TOUR = "/home/claude/tour"
OUT = "/home/claude/adsniper/deliverables/product-tour.html"

def img(name):
    with open(os.path.join(TOUR, name), "rb") as f:
        return "data:image/webp;base64," + base64.b64encode(f.read()).decode()

# (file, route, title, what, how, why, kind)  kind: browser | phone | paper
SCREENS = [
    ("01-login.webp", "/login", "١ · تسجيل الدخول",
     "بوابة الدخول: بريد ورمز مرور.",
     "لا يدخل إلا من أضفته أنت في قائمة المستخدمين. لا يوجد «إنشاء حساب» للغرباء. لاحقًا يمكن التحويل إلى رابط دخول يصل بالبريد بدل الرمز.",
     "أمان يليق ببنك: لا أحد يرى البيانات بلا إذنك.", "browser"),

    ("02-command-view.webp", "/", "٢ · الشاشة الرئيسية: مراقبة إعلانات المنافسين",
     "أول ما تراه بعد الدخول: صورة اليوم كاملة. مرّر داخل الإطار لترى الصفحة كلها.",
     "في الأعلى خمسة أرقام: إعلانات المنافسين النشطة، الجديدة هذا الأسبوع، المتوقفة، أطول إعلان ما زال يعمل، وإعلاناتك للمقارنة. ثم تنبيه «حملة جديدة محتملة» يظهر عندما يقفز منافس فوق معدّله المعتاد. ثم لوحة «أطول الإعلانات عمرًا» (الإعلان الذي يبقى هو الإعلان الذي يربح). ثم كل الإعلانات المرصودة مرتّبة حسب البنك، كل إعلان يحمل مرحلته: اختبار جديد، يكتسب زخمًا، مُثبت. ثم جدول «مؤشر الضغط الإعلاني والإنفاق التقديري». وفي الأسفل منشورات X وLinkedIn.",
     "تعرف في دقيقة: من يضغط، بماذا، ومنذ متى.", "browser"),

    ("03-ad-detail.webp", "/ (نافذة الإعلان)", "٣ · تفاصيل إعلان واحد",
     "اضغط أي إعلان فتفتح نافذته.",
     "الصورة أو الفيديو الأصلي محفوظ عندنا حتى لو حذفه المنافس من المنصّة. معه النص، مرحلة الإعلان، أول مرة وآخر مرة رُصد فيها، زر الدعوة، المنصّات التي ظهر عليها (facebook · instagram)، وصفحة الهبوط.",
     "الدليل الكامل بين يديك، جاهز للنقاش مع الوكالة.", "browser"),

    ("04-brand-self.webp", "/brand/… (بنك البلاد)", "٤ · صفحة علامتك: بنك البلاد",
     "صفحة خاصة بكل بنك، وهذه صفحتك أنت.",
     "اتجاه التفاعل على 90 يومًا، أقوى المنشورات، خريطة أوقات النشر (أي يوم وأي ساعة)، نمو المتابعين، كل المنشورات مع فلاتر، وكل الإعلانات مع «سجل الإعلانات»: أول ظهور، آخر ظهور، الحالة.",
     "تقيس نفسك بالمقياس نفسه الذي تقيس به المنافسين.", "browser"),

    ("05-brand-competitor.webp", "/brand/… (منافس)", "٥ · صفحة منافس: البنك العربي الوطني",
     "الصفحة نفسها لكل منافس من الثمانية.",
     "المكوّنات ذاتها: تفاعل، منشورات، أوقات النشر، متابعون، ثم إعلاناتهم بمراحلها وسجلّها الكامل (منصّة، نص الإعلان، أول وآخر ظهور، نشط أو متوقف).",
     "تفهم عادات كل منافس على حدة: متى ينشر، وبماذا يدفع إعلاناته.", "browser"),

    ("06-compare.webp", "/compare", "٦ · المقارنة",
     "ستة رسوم تضع الجميع في صورة واحدة.",
     "حصتك من الصوت، متوسط التفاعل لكل منشور، سباق نمو المتابعين، حجم النشر، مزيج الوسائط (صورة، فيديو، كاروسيل)، وضغط الإعلانات أسبوعًا بأسبوع لكل بنك.",
     "سؤال «من يتقدّم؟» يُجاب برسم واحد.", "browser"),

    ("07-methodology.webp", "/methodology", "٧ · المنهجية: كيف نعدّ وكيف نقدّر",
     "صفحة الشفافية.",
     "تفصل بوضوح بين «ملاحَظ» (حقائق من مكتبات الإعلانات: العدد، المدة، المنصّة) و«منمذج» (تقديرات: مؤشر الضغط ونطاق الإنفاق). تعرض الافتراضات بالأرقام نفسها التي يستخدمها البرنامج، فلا يمكن أن تختلف الشاشة عن الحساب.",
     "عندما يسأل المدير التنفيذي «من أين جاء هذا الرقم؟» يكون الجواب مكتوبًا.", "browser"),

    ("10-weekly-brief-editor.webp", "/intel/weekly-brief", "٨ · الموجز الأسبوعي (المنتج الرئيسي)",
     "موجز كل اثنين صباحًا، عربي وإنجليزي جنبًا إلى جنب.",
     "يُكتب تلقائيًا من البيانات المرصودة: من زاد إعلاناته، من تراجع، حملات جديدة، قادة الضغط. مع مفتاح الذكاء الاصطناعي يصبح سرديًا أغنى؛ وبدونه يبقى ملخص حقائق دقيقًا كما في الصورة. يمكنك تعديله ثم «نشر»، أو يُنشر تلقائيًا الساعة 8 صباحًا.",
     "هذا ما يقرأه القيادي في 60 ثانية كل أسبوع.", "browser"),

    ("14-weekly-report-page.webp", "/export/weekly/…", "٩ · تقرير الأسبوع التنفيذي",
     "النسخة التي تُطبع وتُرسل.",
     "الأرقام الرئيسية، «الأسبوع في نظرة»، حضورك المدفوع، ثم نشاط كل منافس: كم إعلان، أي منصّات، أطول مدة، وماذا يدفع (تمويل شخصي، بطاقات، تحويلات…)، ثم الإبداعات الجديدة هذا الأسبوع.",
     "ترسله لاجتماع الإدارة كما هو.", "browser"),

    ("15-weekly-pdf.webp", "Export PDF", "١٠ · التصدير PDF",
     "زر «Export PDF» يعطيك الملف نفسه بصيغة PDF.",
     "يُطبع من الصفحة السابقة بخط عربي سليم واتجاه صحيح. هذه صورة الصفحة الأولى من ملف PDF حقيقي أنتجه النظام أثناء هذه الجولة.",
     "ملف واحد للبريد أو للطباعة.", "paper"),

    ("08-intel.webp", "/intel", "١١ · لوحة الإدارة (Intel)",
     "غرفة التحكم لفريق التسويق.",
     "«تخزين الوسائط» مع زر يكتب ويقرأ ويحذف ملفًا فعليًا للتأكد أن الأرشيف يعمل. «الإنفاق هذا الشهر» لكل مصدر مقابل سقفه، والنظام يتوقف تلقائيًا عند السقف. و«صحة السحب»: كل مهمة، آخر تشغيل، حالتها، وزر «Run now» لتشغيلها الآن.",
     "ترى بعينك أن النظام يعمل وكم يصرف.", "browser"),

    ("09-intel-brands.webp", "/intel/brands", "١٢ · إدارة العلامات",
     "أنت + حتى ثمانية منافسين.",
     "لكل علامة: الاسم عربي وإنجليزي، حساب X، صفحة LinkedIn، صفحة Facebook الرسمية، وكلمات المطابقة. زر «اعثر على معرّفات المعلن» يقترح هوية كل بنك في مكتبات Meta وGoogle، وأنت تراجع وتؤكد.",
     "التجهيز يتم من داخل المنتج، بلا مبرمج.", "browser"),

    ("11-log-ad.webp", "/intel/log-ad", "١٣ · تسجيل إعلان يدويًا",
     "للمنصّات التي لا تملك مكتبة إعلانات عامة: X وSnapchat وTikTok.",
     "تصوّر الإعلان بجوالك، تختار البنك والمنصّة، تُرفق اللقطة، فيدخل الأرشيف كأي إعلان آخر بمراحله وتواريخه.",
     "لا تفوتك إعلانات المنصّات المغلقة.", "browser"),

    ("12-settings.webp", "/intel/settings", "١٤ · الإعدادات",
     "هوية النسخة وسلوكها.",
     "اسم الشركة، السوق (SA)، لغة التقرير، «فئات العروض» (تمويل شخصي، بطاقات، ادخار…) التي يصنّف بها النظام الإعلانات، وجدول السحب لكل مصدر.",
     "تُخصَّص لبنك أو لأي قطاع آخر بدون كود.", "browser"),

    ("13-users.webp", "/intel/users", "١٥ · المستخدمون",
     "من يدخل ومن لا.",
     "قائمة بريدية مسموح بها فقط. دور «مشاهد» للقيادة، و«مدير» لفريق التسويق الذي يشغّل السحب ويحرّر الموجز.",
     "صلاحيات واضحة ومحدودة.", "browser"),

    ("16-mobile-home.webp", "/ (جوال)", "١٦ · على الجوال",
     "الشاشة الرئيسية نفسها على الهاتف.",
     "التصميم يعيد ترتيب نفسه تلقائيًا: الأرقام تتراص، التنبيه واضح، والقائمة كاملة.",
     "تراجع الوضع من أي مكان.", "phone"),

    ("17-license-expired.webp", "/license-expired", "١٧ · عند انتهاء الاشتراك",
     "ما يراه العميل حين ينتهي عامه دون تجديد.",
     "التطبيق يُقفل برسالة واضحة، والسحب يتوقف فلا يُصرف عليه ريال، والبيانات والأرشيف محفوظان. عند التجديد يعود كل شيء فورًا. التاريخ لا يُعدَّل من داخل التطبيق؛ يضبطه البائع.",
     "التحكم في الإيراد بيد البائع، لا العميل.", "browser"),
]

def frame(kind, route, src):
    r = html.escape(route)
    if kind == "phone":
        return f'''<div class="phone"><div class="pbar"></div><div class="pview"><img src="{src}" alt=""></div></div>'''
    if kind == "paper":
        return f'''<div class="paper"><img src="{src}" alt=""></div>'''
    return f'''<div class="browser"><div class="bar"><span class="dots"><i></i><i></i><i></i></span><span class="url">rivalscope.app{r}</span></div><div class="view"><img src="{src}" alt=""></div></div>'''

cards = []
for f, route, title, what, how, why, kind in SCREENS:
    cards.append(f'''
<article class="screen">
  <div class="text">
    <h3>{html.escape(title)}</h3>
    <p class="what">{html.escape(what)}</p>
    <div class="kv"><span class="k">كيف تعمل</span><p>{html.escape(how)}</p></div>
    <div class="kv why"><span class="k">لماذا تهمك</span><p>{html.escape(why)}</p></div>
  </div>
  {frame(kind, route, img(f))}
</article>''')

page = f'''<title>RivalScope Product Tour</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
  :root{{--ground:#FAF9F7;--surface:#FFFFFF;--surface-2:#F1EEE9;--ink:#1A1D24;--ink-soft:#4A4640;--muted:#8A837B;--line:#E7E2DB;
    --accent:#B4122A;--accent-soft:#F4DDDF;--good:#1E7A46;--good-soft:#E0F0E6;--warn:#9A6B15;--warn-soft:#F6ECD6;
    --chrome:#ECE8E2;--shadow:0 1px 2px rgba(26,29,36,.05),0 10px 28px rgba(26,29,36,.08);--radius:14px}}
  @media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--ground:#101216;--surface:#181B21;--surface-2:#1F232B;--ink:#ECEAE6;--ink-soft:#B9B4AD;--muted:#8C867E;--line:#2A2F38;
    --accent:#F1697D;--accent-soft:#3A1B22;--good:#5FCB8C;--good-soft:#173026;--warn:#E4B85F;--warn-soft:#33290F;--chrome:#242932;--shadow:0 1px 2px rgba(0,0,0,.3),0 12px 30px rgba(0,0,0,.4)}}}}
  :root[data-theme="dark"]{{--ground:#101216;--surface:#181B21;--surface-2:#1F232B;--ink:#ECEAE6;--ink-soft:#B9B4AD;--muted:#8C867E;--line:#2A2F38;
    --accent:#F1697D;--accent-soft:#3A1B22;--good:#5FCB8C;--good-soft:#173026;--warn:#E4B85F;--warn-soft:#33290F;--chrome:#242932;--shadow:0 1px 2px rgba(0,0,0,.3),0 12px 30px rgba(0,0,0,.4)}}
  *{{box-sizing:border-box}} html{{direction:rtl}}
  body{{margin:0;background:var(--ground);color:var(--ink);font-family:"IBM Plex Sans Arabic",system-ui,sans-serif;line-height:1.7;-webkit-font-smoothing:antialiased}}
  .wrap{{max-width:1080px;margin:0 auto;padding:clamp(20px,4vw,52px) clamp(16px,4vw,40px)}}
  .mono{{font-family:"IBM Plex Mono",monospace;direction:ltr;unicode-bidi:isolate}}
  .mast{{border-top:3px solid var(--accent);padding-top:24px}}
  .eyebrow{{font-size:.74rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}}
  h1{{font-size:clamp(1.9rem,4.4vw,2.8rem);line-height:1.15;margin:.3em 0 .2em;font-weight:700;text-wrap:balance}}
  .sub{{color:var(--ink-soft);font-size:1.05rem;max-width:62ch;margin:0}}
  .note{{margin-top:18px;background:var(--warn-soft);color:var(--ink);border-inline-start:4px solid var(--warn);border-radius:10px;padding:12px 16px;font-size:.92rem}}
  section{{margin-top:44px}}
  h2{{font-size:1.35rem;margin:0 0 6px;font-weight:700}}
  .lede{{color:var(--ink-soft);margin:0 0 18px;max-width:70ch}}
  ol.flow{{list-style:none;counter-reset:s;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}}
  ol.flow li{{counter-increment:s;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 16px 14px;box-shadow:var(--shadow);position:relative}}
  ol.flow li::before{{content:counter(s);font-family:"IBM Plex Mono",monospace;font-weight:600;color:var(--accent);background:var(--accent-soft);width:30px;height:30px;border-radius:8px;display:grid;place-items:center;margin-bottom:10px}}
  ol.flow li b{{display:block;margin-bottom:4px}} ol.flow li p{{margin:0;font-size:.9rem;color:var(--ink-soft)}}
  .screens{{display:flex;flex-direction:column;gap:28px}}
  .screen{{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:22px;display:grid;grid-template-columns:minmax(260px,330px) 1fr;gap:22px;align-items:start}}
  .screen h3{{margin:0 0 6px;font-size:1.12rem;font-weight:700}}
  .what{{margin:0 0 12px;color:var(--ink);font-weight:500}}
  .kv{{border-top:1px dashed var(--line);padding-top:10px;margin-top:10px}}
  .kv .k{{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.08em;color:var(--muted);margin-bottom:4px}}
  .kv p{{margin:0;font-size:.93rem;color:var(--ink-soft)}}
  .kv.why .k{{color:var(--good)}} .kv.why p{{color:var(--ink)}}
  .browser{{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--chrome)}}
  .bar{{display:flex;align-items:center;gap:10px;padding:8px 12px;direction:ltr}}
  .dots i{{display:inline-block;width:10px;height:10px;border-radius:50%;background:#C9C3BB;margin-right:5px}}
  .url{{font-family:"IBM Plex Mono",monospace;font-size:.74rem;color:var(--muted);background:var(--surface);border-radius:6px;padding:3px 10px;flex:1}}
  .view{{max-height:640px;overflow:auto;background:#fff}} .view img{{display:block;width:100%;height:auto}}
  .phone{{width:300px;margin:0 auto;border:1px solid var(--line);border-radius:26px;overflow:hidden;background:var(--chrome);padding:10px 8px}}
  .pbar{{width:90px;height:6px;border-radius:3px;background:#C9C3BB;margin:0 auto 8px}}
  .pview{{max-height:600px;overflow:auto;border-radius:18px;background:#fff}} .pview img{{display:block;width:100%}}
  .paper{{max-width:520px;margin:0 auto;border:1px solid var(--line);box-shadow:var(--shadow);background:#fff}} .paper img{{display:block;width:100%}}
  .checks{{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}}
  .checks li{{display:flex;gap:10px;align-items:flex-start;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px;font-size:.93rem}}
  .checks li .t{{color:var(--good);font-weight:700;flex:0 0 auto}}
  .honest{{background:var(--surface-2);border-radius:var(--radius);padding:18px 20px}}
  .honest p{{margin:.4em 0;font-size:.95rem}}
  .try{{background:var(--accent-soft);border-radius:var(--radius);padding:18px 20px}}
  .try p{{margin:.4em 0}}
  .foot{{margin-top:40px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:.82rem}}
  @media (max-width:760px){{.screen{{grid-template-columns:1fr}}}}
</style>
<div class="wrap">
  <header class="mast">
    <div class="eyebrow">جولة داخل المنتج · RivalScope / AdSniper</div>
    <h1>شاشة بشاشة، بلغة بسيطة</h1>
    <p class="sub">كل الصور أدناه مأخوذة من نسخة تعمل فعلًا، شغّلتها ودخلت عليها بحسابك وتنقّلت بين شاشاتها. تحت كل شاشة: ما هي، كيف تعمل، ولماذا تهمك.</p>
    <div class="note"><b>تنبيه مهم:</b> البيانات في الصور هي «مجموعة العرض التجريبية» المدمجة في المنتج (كل إعلان معلَّم SAMPLE). الأسماء حقيقية (البنوك السعودية التسعة) لكن الإعلانات والأرقام مصطنعة للعرض، وليست قراءة سوق. البيانات الحقيقية تبدأ بعد تفعيل مفتاح Apify.</div>
  </header>

  <section>
    <h2>الفكرة كلها في خمس خطوات</h2>
    <p class="lede">هذا ما يحدث خلف الشاشات، بلا مصطلحات.</p>
    <ol class="flow">
      <li><b>تسجّل علامتك ومنافسيك</b><p>مرة واحدة: بنك البلاد + حتى ثمانية منافسين، من داخل المنتج.</p></li>
      <li><b>«روبوت» يجمع إعلاناتهم يوميًا</b><p>يزور مكتبات إعلانات Meta وGoogle العامة ويسجّل كل إعلان يعرضه المنافسون في السعودية.</p></li>
      <li><b>يحفظ نسخة من كل إعلان للأبد</b><p>الصورة والفيديو والنص في أرشيف دائم لا يُمحى، حتى بعد أن يحذف المنافس إعلانه.</p></li>
      <li><b>يحسب العمر ويرصد التغيّر</b><p>كم يومًا بقي كل إعلان يعمل، ومن أطلق حملة جديدة، ومن توقّف.</p></li>
      <li><b>يكتب لك الموجز كل اثنين</b><p>عربي وإنجليزي، للقيادة، مع تقرير PDF جاهز للإرسال.</p></li>
    </ol>
  </section>

  <section>
    <h2>الشاشات، واحدة واحدة</h2>
    <p class="lede">الإطار يمرَّر داخله للصفحات الطويلة. الترتيب هو ترتيب الاستخدام الطبيعي.</p>
    <div class="screens">{''.join(cards)}</div>
  </section>

  <section>
    <h2>ما الذي تأكّدتُ منه بنفسي، بلغة بسيطة</h2>
    <p class="lede">هذا هو معنى «إثبات الجاهزية» الذي طلبته. كل بند جرّبته فعلًا على قاعدة بيانات وتخزين حقيقيين، لا قراءة كود.</p>
    <ul class="checks">
      <li><span class="t">✓</span><span>الأرشيف لا يُمحى عند إعادة تشغيل الخادم أو تحديثه. الملفات في «صندوق» مستقل خارج التطبيق.</span></li>
      <li><span class="t">✓</span><span>لا أحد يرى صور الإعلانات بدون تسجيل دخول. جرّبت بدون حساب فمُنعت، وبحساب فظهرت.</span></li>
      <li><span class="t">✓</span><span>إعادة السحب لا تُكرّر الإعلانات، وتاريخ «أول ظهور» يثبت بينما «آخر ظهور» يتقدّم.</span></li>
      <li><span class="t">✓</span><span>الإعلان الذي يختفي من المنصّة يُعلَّم «متوقفًا» بعد 7 أيام تلقائيًا.</span></li>
      <li><span class="t">✓</span><span>إذا تعطّل مصدر واحد، الباقي يستمر ويُسجَّل الخطأ بوضوح بدل أن ينهار النظام.</span></li>
      <li><span class="t">✓</span><span>عند بلوغ سقف الميزانية الشهري، يتوقف الصرف تلقائيًا، صفر طلبات إضافية.</span></li>
      <li><span class="t">✓</span><span>تجهيز عميل جديد من الصفر: البرمجية تحتاج أقل من دقيقة. (الوقت البشري لإنشاء الحسابات السحابية يُقاس لاحقًا.)</span></li>
      <li><span class="t">✓</span><span>الموجز الأسبوعي يخرج عربيًا وإنجليزيًا حتى بدون مفتاح ذكاء اصطناعي، وملف PDF حقيقي يُصدَّر.</span></li>
      <li><span class="t">✓</span><span>عند انتهاء الاشتراك: التطبيق يُقفل والسحب يتوقف والبيانات تبقى.</span></li>
    </ul>
  </section>

  <section>
    <h2>ملاحظتان بصراحة</h2>
    <div class="honest">
      <p><b>١ · الموجز اليومي يحتاج مفتاح الذكاء الاصطناعي.</b> الموجز الأسبوعي (المنتج الرئيسي) يعمل بدونه، لكن اليومي يتوقف بدونه. صغيرة، وسجّلتها.</p>
      <p><b>٢ · لا شيء في هذه الجولة بيانات حقيقية.</b> السحب الحقيقي من Meta وGoogle يحتاج مفتاح Apify مموّلًا. المسار كله مُثبت؛ الخطوة الأخيرة قرارك.</p>
    </div>
  </section>

  <section>
    <h2>جرّبه بنفسك</h2>
    <div class="try">
      <p>النسخة التجريبية المنشورة على Railway تعرض الشاشات نفسها بمجموعة العرض ذاتها: <span class="mono">adsniper-production.up.railway.app</span></p>
      <p>الدخول ببريدك ورمز المرور المشترك للنسخة (عندك في إعدادات الخدمة). ابدأ من الشاشة الرئيسية، اضغط أي إعلان، ثم Intel لترى غرفة التحكم.</p>
    </div>
  </section>

  <footer class="foot">الصور من نسخة محلية شُغِّلت في 3 سبتمبر 2026 بمجموعة العرض التجريبية. المرجع التقني الكامل: <span class="mono">docs/VERIFICATION.md</span>.</footer>
</div>
'''
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(page)
print("wrote", OUT, round(os.path.getsize(OUT)/1024), "KB")
