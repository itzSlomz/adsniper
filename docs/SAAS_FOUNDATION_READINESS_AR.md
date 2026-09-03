# AdSniper — تقرير تأسيس منصة SaaS وجاهزيتها المؤسسية

- **الإصدار:** 1.0
- **تاريخ التقييم:** 2026-09-03
- **النطاق:** الأساس التقني والتشغيلي والأمني والتجاري اللازم لتحويل AdSniper إلى منتج SaaS موثوق يُباع للشركات
- **مرجع الكود:** الفرع `claude/adsniper-fork-baqjyb`، الالتزام `ab736c2`

---

## 1. الغرض من الوثيقة

هذه الوثيقة هي **خط أساس تنفيذي وقائمة تحقق للجاهزية**، وليست وصفاً عاماً لأفضل الممارسات. الهدف منها:

1. تحديد المكونات التي يجب أن تتوافر في أي منصة SaaS مؤسسية بصرف النظر عن مجال المنتج.
2. تقييم الحالة الحالية لـAdSniper مقابل تلك المكونات.
3. تحويل الفجوات إلى متطلبات قابلة للتنفيذ والاختبار.
4. منع إطلاق نسخة تجارية اعتماداً على وجود الواجهة أو نجاح البناء فقط.
5. تحديد بوابات واضحة للانتقال من التطوير إلى Pilot ثم General Availability.

لا يُعتبر أي متطلب مكتملاً لمجرد وجود كود متعلق به. الاكتمال يتطلب **تنفيذاً + اختباراً + دليلاً محفوظاً + مراقبة تشغيلية + توثيقاً**.

---

## 2. الحكم التنفيذي

AdSniper يمتلك نواة منتج جيدة: واجهة Ads-first، أرشيف إبداعي، تقارير عربية/إنجليزية، إدارة علامات ومنافسين، ضبط لتكاليف المزودين، وعزل بنيوي من خلال نسخة مستقلة لكل عميل.

لكن المنصة الحالية لا تحقق بعد الحد الأدنى اللازم لتُباع على أنها SaaS إنتاجية موثوقة. التصنيف الأدق للحالة الحالية هو:

> **Productized Beta غير جاهزة لإدخال بيانات عميل مؤسسي قبل إغلاق متطلبات P0.**

ويجب اعتماد المعمارية تجارياً تحت الوصف التالي:

> **Single-tenant Managed SaaS:** نسخة تطبيق وقاعدة بيانات وتخزين مستقلة لكل عميل، تديرها الجهة الموردة من خلال إصدار موحد وعمليات مركزية.

هذا الاختيار مناسب لعملاء المؤسسات ويقوي العزل، لكنه لا يلغي متطلبات SaaS؛ بل يضيف الحاجة إلى إدارة أسطول النسخ، توحيد الإعدادات، النشر المرحلي، المراقبة المركزية، النسخ الاحتياطي، وإدارة الأسرار والتراخيص.

### قرار الإطلاق

- **الآن:** لا إطلاق عام ولا عقد إنتاج قياسي.
- **بعد إغلاق P0:** Pilot مدفوع ومحدود مع 1–2 Design Partners وبشروط تغطية واضحة.
- **بعد إغلاق P1 وإثبات الـPilot:** General Availability لعملاء المؤسسات.

---

## 3. منهجية الأولويات والحالات

### الأولوية

| الرمز | المعنى | أثر عدم التنفيذ |
|---|---|---|
| **P0** | مانع للـPilot الخارجي | خطر أمني، فقد بيانات، نتيجة مضللة، أو فشل تشغيلي جوهري |
| **P1** | مانع للإطلاق العام GA | المنتج قد يعمل، لكنه غير جاهز للتعاقد والتوسع المؤسسي |
| **P2** | مطلوب للتوسع والكفاءة | لا يمنع البداية المحدودة، لكنه يمنع النمو الآمن والاقتصادي |

### حالة المتطلب الحالية

| الحالة | التعريف |
|---|---|
| **متحقق** | نُفذ واختُبر بدليل مستقل مناسب |
| **جزئي** | يوجد جزء من الحل، لكن معيار القبول غير مكتمل |
| **غير مثبت** | توجد وثيقة أو كود، لكن السلوك الإنتاجي لم يُثبت |
| **غير موجود** | لم يُعثر على تنفيذ أو دليل في المستودع الحالي |
| **مانع حالي** | فجوة تمنع إدخال عميل خارجي أو بيانات إنتاجية |

---

## 4. خط الأساس الحالي — نتائج مؤكدة

| المجال | الحالة الحالية | الدليل أو الملاحظة |
|---|---|---|
| بناء الإنتاج | متحقق جزئياً | `npx tsc --noEmit` نجح و`npm run build` نجح مع تحذيرات Edge Runtime |
| جودة الكود الآلية | مانع حالي | `npm run lint` غير مهيأ ويفتح إعداداً تفاعلياً؛ لا توجد automated test suite أو CI pipeline |
| أمن التبعيات | مانع حالي | `npm audit --omit=dev` أظهر 2 Critical و8 High في نسخة التبعيات الحالية؛ يلزم التحديث ثم تقييم قابلية الاستغلال وإعادة الاختبار |
| المصادقة | مانع حالي | النسخة المنشورة تستخدم بريد + Passcode مشترك؛ لا يظهر Rate Limiting أو MFA أو SSO أو إدارة جلسات مؤسسية |
| عزل العملاء | جزئي قوي | التصميم يفصل التطبيق وقاعدة البيانات وBucket لكل عميل؛ لم توجد بعد إدارة مركزية لأسطول النسخ أو اختبار تسرب آلي بين العملاء |
| تخزين الوسائط | غير مكتمل | مسار S3 اختُبر على MinIO؛ R2 الفعلي للنسخة المنشورة لم يُجهز وفق `docs/STATUS.md` |
| قاعدة البيانات | جزئي | Postgres ومهاجرات Prisma موجودة؛ لا يوجد دليل على سياسة Backup/Restore أو Restore Drill إنتاجي |
| جلب البيانات | غير مثبت | 22/22 لاختبار Fixture يثبت mechanics فقط؛ لا يوجد بعد Paid Live Pull يثبت بيانات السوق السعودي |
| صحة حالة الإعلان | مانع حالي | منطق `adsPoll` يستطيع تحويل إعلانات إلى inactive بعد 7 أيام حتى عند فشل/تعطيل المصدر أو نقص النتائج |
| تشغيل المهام | جزئي ضعيف | In-process cron؛ لا يوجد distributed lock أو durable queue أو checkpoint/recovery واضح |
| المراقبة والتنبيهات | غير موجود | توجد شاشة آخر تشغيل داخل المنتج، لكن لا يوجد external uptime/error monitoring أو alerting أو SLOs |
| Audit Trail | غير موجود | لا يوجد سجل غير قابل للتلاعب لتغييرات المستخدمين والإعدادات والتقارير والتشغيل اليدوي |
| الخصوصية ودورة حياة البيانات | غير موجود | لا توجد Data Inventory/Retention/Deletion/DSR/DPA/Subprocessor package موثقة |
| إدارة الاشتراك | جزئي | تاريخ انتهاء وترخيص في environment variables؛ الخطط والـentitlements والفوترة والتجديد ليست منظومة كاملة |
| تشغيل عميل جديد | غير مثبت إنتاجياً | Rehearsal برمجية ناجحة، لكن لم يُقَس provisioning حقيقي شامل Railway/R2/أسرار/نسخ احتياطي |
| الجاهزية التجارية | غير مثبت | السعر المقترح غير معتمد ولم يُختبر willingness-to-pay أو الاستخدام الفعلي لدى عميل |

### ملاحظة على أدلة التحقق الحالية

نتائج `docs/VERIFICATION.md` مفيدة ويجب الحفاظ عليها، لكنها لا تغطي وحدها:

- صحة واكتمال بيانات المزود الحي.
- قابلية استعادة بيانات عميل بعد حادث فعلي.
- مقاومة الاختراق وإساءة استخدام المصادقة.
- التشغيل المتزامن وفشل الـjobs أثناء إعادة النشر.
- متطلبات الامتثال والتعاقد والدعم.

---

## 5. متطلبات الأساس الإلزامي للمنصة

### 5.1 المعمارية، عزل العملاء، وإدارة الأسطول

| ID | الأولوية | المتطلب | الحالة | معيار القبول والدليل المطلوب |
|---|---:|---|---|---|
| ARC-01 | P0 | تثبيت قرار Single-tenant Managed SaaS في ADR رسمي | جزئي | ADR يحدد حدود كل عميل: app، DB، storage، secrets، domain، logs، backups، region، ومسؤولية المورد/العميل |
| ARC-02 | P0 | عزل فعلي لكل عميل | جزئي | اختبار آلي يثبت أن credentials الخاصة بعميل A لا تقرأ DB أو bucket أو media لعميل B؛ فشل الاختبار يمنع النشر |
| ARC-03 | P1 | سجل مركزي لجميع النسخ | غير موجود | Inventory يعرض customer، environment، app version، migration version، region، license، storage health، backup status، provider health، وآخر heartbeat |
| ARC-04 | P1 | Infrastructure as Code وقالب provisioning موحد | غير موجود | إنشاء بيئة جديدة من تعريف version-controlled دون خطوات يدوية غير موثقة؛ config drift check ناجح |
| ARC-05 | P1 | فصل Development/Staging/Production | جزئي | حسابات وDB وbuckets وأسرار مستقلة؛ لا يمكن نقل sample data أو secrets بين البيئات تلقائياً |
| ARC-06 | P1 | إدارة إصدار كل نسخة ونشر مرحلي | غير موجود | دعم pinning للإصدار، staging ثم canary ثم rollout؛ إمكانية إيقاف rollout وrollback دون فقد بيانات |
| ARC-07 | P1 | مهاجرات آمنة ومتوافقة للخلف | جزئي | اختبار migration على نسخة production-like؛ backup قبل التغيير؛ expand/migrate/contract للتغييرات الخطرة؛ rollback/runbook موثق |
| ARC-08 | P2 | Control Plane لإدارة الأسطول | غير موجود | تنفيذ العمليات المشتركة دون دخول يدوي لكل Railway project، مع صلاحيات دقيقة وسجل تدقيق |

### 5.2 الهوية، المصادقة، والصلاحيات

| ID | الأولوية | المتطلب | الحالة | معيار القبول والدليل المطلوب |
|---|---:|---|---|---|
| IAM-01 | P0 | إلغاء أي credential مشترك بين المستخدمين | مانع حالي | لا يوجد shared passcode في Production؛ كل دخول مرتبط بهوية فردية قابلة للإلغاء |
| IAM-02 | P0 | Rate Limiting وحماية brute force | غير موجود | حدود موثقة حسب IP + account + tenant؛ اختبارات آلية تثبت الرفض والتنبيه دون تمكين DoS على مستخدم شرعي |
| IAM-03 | P0 | إدارة جلسات آمنة | جزئي | انتهاء زمني، rotation، revoke all sessions، إبطال الجلسة عند إزالة المستخدم/تغيير دوره، وcookies آمنة |
| IAM-04 | P0 | Least Privilege للأدوار | جزئي | مصفوفة صلاحيات Viewer/Admin/Support؛ اختبارات authorization لكل route وServer Action وAPI وexport وmedia |
| IAM-05 | P1 | SSO مؤسسي عبر OIDC أو SAML | غير موجود | تكامل مع IdP واحد على الأقل؛ domain/tenant restriction؛ إبطال المستخدم يوقف دخوله وفق السياسة المتفق عليها |
| IAM-06 | P1 | MFA | غير موجود | إلزام MFA للحسابات الإدارية، أو وراثته وإثباته من IdP المؤسسي |
| IAM-07 | P1 | دورة حياة المستخدم | جزئي | invite، activate، role change، suspend، remove، ownership transfer، ومنع إزالة آخر Admin |
| IAM-08 | P1 | سياسات جلسات وإدارة أجهزة | غير موجود | عرض الجلسات النشطة، الإلغاء، idle/absolute timeout، وتسجيل أحداث الدخول والفشل والخروج |
| IAM-09 | P1 | Break-glass access مضبوط | غير موجود | حساب طوارئ مراقب، محفوظ بأمان، محدود زمنياً، واستخدامه يولد تنبيهاً وسجل تدقيق |

### 5.3 أمن التطبيق وسلسلة التوريد البرمجية

| ID | الأولوية | المتطلب | الحالة | معيار القبول والدليل المطلوب |
|---|---:|---|---|---|
| SEC-01 | P0 | إغلاق الثغرات الحرجة والمرتفعة في التبعيات | مانع حالي | SCA على clean install: صفر Critical؛ كل High إما مصحح أو موثق كغير قابل للاستغلال بموافقة ومهلة انتهاء وتعويضات |
| SEC-02 | P0 | اعتماد OWASP ASVS 5.0.0 Level 2 كخط تحقق | غير موجود | مصفوفة controls scoped؛ اختبار مستقل؛ كل فشل له issue وowner وقرار risk acceptance واضح |
| SEC-03 | P0 | Security Headers وحماية المتصفح | جزئي | CSP مناسب، HSTS، frame-ancestors، nosniff، referrer policy، permissions policy؛ اختبار headers آلي |
| SEC-04 | P0 | حماية الوسائط الخاصة من التخزين الوسيط العام | مانع محتمل | إزالة `Cache-Control: public` من media الخاصة أو استخدام signed/private caching مصمم؛ اختبار يثبت عدم تسرب ملف بين جلسات/عملاء |
| SEC-05 | P0 | حماية تنزيل الوسائط من SSRF والملفات الخطرة | غير موجود | منع loopback/private/link-local metadata IPs، DNS rebinding، redirects غير الآمنة؛ allowlist/validation للمصادر؛ حدود حجم ونوع ووقت |
| SEC-06 | P0 | تحقق مركزي من المدخلات | جزئي | schema validation لكل forms/APIs/provider payloads؛ حدود أحجام؛ رفض enum/date/URL غير الصحيح برسالة آمنة |
| SEC-07 | P0 | إدارة الأسرار | جزئي | لا أسرار في repo/logs؛ secret store؛ rotation runbook؛ فصل أسرار العملاء؛ كشف secrets داخل CI |
| SEC-08 | P1 | تشفير ونقل آمن | جزئي | TLS enforced؛ encryption at rest موثق لكل DB/bucket/backup؛ مفاتيح وصلاحيات منفصلة حسب البيئة |
| SEC-09 | P1 | SAST وDAST واختبارات أمنية داخل SDLC | غير موجود | SAST/SCA/secret scan لكل PR؛ DAST دوري على staging؛ النتائج مرتبطة بمهل إصلاح حسب الشدة |
| SEC-10 | P1 | Penetration Test مستقل قبل GA | غير موجود | تقرير من جهة مستقلة، إغلاق Critical/High، وإعادة اختبار موثق |
| SEC-11 | P1 | Security Contact وVulnerability Disclosure | غير موجود | قناة إبلاغ، سياسة استقبال وتصنيف واستجابة، وعدم كشف تفاصيل العملاء |
| SEC-12 | P1 | SBOM لكل إصدار | غير موجود | SBOM versioned ومربوط بالإصدار المنشور ويمكن البحث فيه عند ظهور CVE جديد |

### 5.4 صحة البيانات، التغطية، ومنع الاستنتاجات المضللة

| ID | الأولوية | المتطلب | الحالة | معيار القبول والدليل المطلوب |
|---|---:|---|---|---|
| DAT-01 | P0 | نموذج Observation مستقل لكل brand/provider/run | غير موجود | تخزين حالة المحاولة، النجاح، الاكتمال، pagination، truncation، عدد النتائج، الخطأ، التكلفة، وبداية/نهاية الرصد |
| DAT-02 | P0 | منع الانتقال الكاذب إلى Inactive | مانع حالي | لا يتحول أي إعلان إلى inactive بسبب failed/partial/disabled/capped pull؛ اختبارات failure لمدة تتجاوز 7 أيام تثبت ذلك |
| DAT-03 | P0 | حالة `Unknown / Not observed` | غير موجود | UI/API/report يفرق بين confirmed inactive وtemporarily unobserved وsource unavailable |
| DAT-04 | P0 | التحقق من pagination وحدود النتائج | غير مثبت | Live test لمعلن يتجاوز الحد؛ إظهار `truncated/partial` إذا لم يمكن جلب جميع الصفحات؛ لا وسم `full` عند cap |
| DAT-05 | P0 | Paid Live Pilot للسوق السعودي | غير مثبت | علامات حقيقية، دورتان ناجحتان على الأقل، مقارنة يدوية بالمصدر، وتقرير precision/coverage/false-status/cost دون sample data |
| DAT-06 | P0 | Capability Contract لكل مزود | غير موجود | كل adapter يصرح بما يدعمه: status، dates، text، assets، pagination، completeness، geography، cost؛ unsupported لا يعود كـzero results |
| DAT-07 | P0 | فصل sample/fixture/production | جزئي | Production guard يمنع fixture flags؛ sample records تحمل نوعاً واضحاً؛ لا يمكن خلطها مع real data؛ تقرير/تصدير يوضح المصدر |
| DAT-08 | P0 | مراجعة مصطلحات lifecycle | جزئي مضلل | استبدال `Proven/Gaining traction` بمصطلحات لا تدعي أداءً غير مرصود، أو توفير دليل أداء حقيقي؛ Product sign-off موثق |
| DAT-09 | P1 | Data Lineage | جزئي | لكل رقم/بطاقة/تقرير يمكن تتبع المصدر، run، timestamp، transform، coverage، وهل القيمة observed أم modeled |
| DAT-10 | P1 | Ground-truth regression dataset | غير موجود | عينة ثابتة من payloads حقيقية منزوعة الحساسية؛ اختبارات mapping تمنع كسر adapters عند تحديث المزود |
| DAT-11 | P1 | قواعد جودة البيانات | غير موجود | قواعد freshness، duplicates، impossible dates، missing assets، count anomalies؛ التنبيه قبل وصول النتيجة للعميل |
| DAT-12 | P1 | Governance للتقديرات والمؤشرات | جزئي | owner للمنهجية، version لكل نموذج، change log، sensitivity test، وموافقة Product قبل تعديل الأوزان أو ranges |

### 5.5 المهام الخلفية، الجدولة، والاعتمادية

| ID | الأولوية | المتطلب | الحالة | معيار القبول والدليل المطلوب |
|---|---:|---|---|---|
| JOB-01 | P0 | منع التشغيل المتزامن لنفس المهمة | غير موجود | DB/advisory lock أو queue uniqueness؛ تشغيل manual+cron معاً لا يكرر التكلفة أو البيانات |
| JOB-02 | P0 | Idempotency كاملة | جزئي | إعادة نفس run بعد interruption لا تنشئ duplicate ولا تفقد items ولا تغير firstSeen بشكل خاطئ |
| JOB-03 | P0 | Retry مع exponential backoff وjitter | غير موجود | تصنيف retryable/non-retryable؛ احترام 429/Retry-After؛ سقف محاولات؛ user-visible degraded state |
| JOB-04 | P0 | عدم مساواة رسائل info بالأخطاء | خلل حالي | فصل logs/warnings/errors؛ المهمة السليمة تظهر success؛ اختبارات حالة لكل سيناريو |
| JOB-05 | P0 | Recovery بعد restart/deploy | غير موجود | heartbeat/lease؛ اكتشاف runs العالقة؛ resume أو safe replay؛ اختبار kill أثناء ingest ثم recovery |
| JOB-06 | P1 | Durable scheduler/queue | غير موجود | فصل الجدولة عن web process أو إثبات ضمانات بديلة؛ لا تفقد trigger أثناء restart |
| JOB-07 | P1 | Dead-letter/replay workflow | غير موجود | عرض العمليات الفاشلة، السبب، payload المرجعي الآمن، وإعادة التشغيل بصلاحية وسجل تدقيق |
| JOB-08 | P1 | Cost guard على التكلفة المتوقعة والفعلية | جزئي | منع overshoot المتوقع؛ تسجيل zero-result/failed paid calls؛ provider run IDs؛ reconciliation مع الفاتورة |
| JOB-09 | P1 | حدود التوازي والموارد | غير موجود | limits لكل provider/tenant؛ timeout/cancellation؛ load test يثبت عدم تعطيل web/PDF أثناء ingest |

### 5.6 التخزين، النسخ الاحتياطي، والاستعادة

| ID | الأولوية | المتطلب | الحالة | معيار القبول والدليل المطلوب |
|---|---:|---|---|---|
| STO-01 | P0 | Object Storage دائم وخاص لكل عميل | غير مكتمل | R2/S3 فعلي، bucket-scoped credentials، public access blocked، write/read/delete test، واستمرار الوسائط بعد redeploy |
| STO-02 | P0 | نسخ احتياطي تلقائي لقاعدة البيانات | غير موجود | schedule وretention وencryption وmonitoring موثقة؛ فشل النسخ يولد alert |
| STO-03 | P0 | Restore Drill | غير موجود | استعادة DB وmedia إلى بيئة معزولة والتحقق من الاتساق؛ تسجيل الزمن الفعلي ونسبة النجاح |
| STO-04 | P0 | اعتماد RPO/RTO | غير موجود | قيم يعتمدها Product/Ops والعقد؛ الاختبارات تثبت القدرة على تحقيقها أو توضح الفجوة |
| STO-05 | P1 | Versioning/immutability للنسخ | غير موجود | حماية من الحذف/التشفير العرضي حسب مستوى المخاطر، مع صلاحيات منفصلة عن التطبيق |
| STO-06 | P1 | Data Retention وDeletion | غير موجود | سياسة لكل نوع بيانات؛ job للحذف؛ legal hold عند الحاجة؛ تقرير حذف يمكن تدقيقه |
| STO-07 | P1 | اتساق DB وObject Storage | غير موجود | كشف orphaned rows/objects، checksum، reconciliation job، وآلية إصلاح آمنة |
| STO-08 | P1 | Offboarding export and purge | غير موجود | تصدير متفق عليه، إلغاء الوصول، حذف الأسرار والنسخ والبيانات وفق العقد، وشهادة إتمام |

### 5.7 المراقبة، SLOs، والاستجابة للحوادث

| ID | الأولوية | المتطلب | الحالة | معيار القبول والدليل المطلوب |
|---|---:|---|---|---|
| OBS-01 | P0 | Health/Readiness endpoints | غير موجود | فحص app، DB، storage، scheduler، ومؤشر freshness دون كشف أسرار؛ المنصة لا تستقبل traffic إذا لم تكن ready |
| OBS-02 | P0 | Error Monitoring مركزي | غير موجود | exceptions مع environment/version/request/job correlation؛ إخفاء الأسرار والبيانات الحساسة |
| OBS-03 | P0 | تنبيهات ingestion freshness والفشل | غير موجود | alert عند تجاوز threshold معتمد، توقف مزود، ارتفاع errors، cost ceiling، أو عدم وصول briefing |
| OBS-04 | P0 | Structured Logs | جزئي | JSON logs، correlation IDs، tenant/instance ID غير حساس، job/provider/run IDs، retention وaccess control |
| OBS-05 | P1 | تعريف SLIs/SLOs | غير موجود | Availability، latency، ingestion freshness، briefing delivery، backup success؛ أهداف يعتمدها العمل وليست أرقاماً مفترضة |
| OBS-06 | P1 | Runbooks وتشغيل On-call | غير موجود | runbook لكل alert، owner وتصعيد، اختبار incident tabletop، وتوثيق إجراءات العملاء |
| OBS-07 | P1 | Incident Response | غير موجود | detect/triage/contain/recover/notify/postmortem؛ تمرين موثق؛ ربط بمتطلبات الخصوصية والعقود |
| OBS-08 | P1 | Status Page واتصالات الأعطال | غير موجود | فصل incident داخلي عن رسالة العميل؛ تاريخ الأعطال والصيانة؛ قوالب اتصال معتمدة |

### 5.8 هندسة الجودة، CI/CD، وإدارة الإصدارات

| ID | الأولوية | المتطلب | الحالة | معيار القبول والدليل المطلوب |
|---|---:|---|---|---|
| SDLC-01 | P0 | إعداد ESLint غير تفاعلي | مانع حالي | `npm run lint` يعمل في clean clone ويعيد exit 0 دون prompt |
| SDLC-02 | P0 | CI إلزامي لكل PR | غير موجود | install lockfile، typecheck، lint، unit، integration، build، migration check، SCA، secret scan؛ branch protection يمنع الدمج عند الفشل |
| SDLC-03 | P0 | اختبارات للوحدات والمنطق الحرج | غير موجود | تغطية منطق status/coverage/cost/license/roles/estimation؛ التركيز على risk coverage لا رقم تغطية شكلي |
| SDLC-04 | P0 | Integration tests حقيقية | جزئي | Postgres + S3-compatible + auth + jobs + exports؛ تعمل آلياً وتعيد البيئة لحالة نظيفة |
| SDLC-05 | P0 | End-to-end smoke test للإصدار | جزئي | login، dashboard، admin action، ingest fixture، media auth، briefing، PDF، license؛ ينجح قبل rollout |
| SDLC-06 | P1 | Release artifact ثابت | غير موجود | نفس artifact المختبر ينتقل إلى staging ثم production؛ لا rebuild مختلف لكل عميل |
| SDLC-07 | P1 | Canary وRollback | غير موجود | rollout محدود، health gate، auto-stop، rollback مجرب مع migrations متوافقة |
| SDLC-08 | P1 | Definition of Done موحد | غير موجود | لا يغلق issue دون tests، evidence، docs، monitoring، security impact، migration/rollback عند الحاجة |
| SDLC-09 | P1 | Dependency update policy | غير موجود | bot/عملية دورية، SLA حسب severity، اختبار updates، inventory وowner |
| SDLC-10 | P2 | Feature Flags | غير موجود | إطلاق تدريجي لكل instance/plan مع audit وإزالة flags المنتهية |

### 5.9 الخصوصية، الحوكمة، والجاهزية التنظيمية

> تحديد انطباق المتطلبات القانونية على كل عميل ونشاط يحتاج مراجعة قانونية مختصة. هذه الوثيقة لا تُصدر حكماً قانونياً، لكنها تضع القدرات التي يجب ألا تغيب عن منصة تستهدف شركات سعودية.

| ID | الأولوية | المتطلب | الحالة | معيار القبول والدليل المطلوب |
|---|---:|---|---|---|
| GOV-01 | P0 | Data Inventory وData Flow Map | غير موجود | تحديد كل بيانات المستخدمين والعملاء والمزودين والـlogs والنسخ، مكانها، غرضها، مدتها، ومن يستطيع الوصول إليها |
| GOV-02 | P0 | مراجعة قانونية لمصادر الإعلانات وشروط المنصات | غير موجود | رأي موثق حول scraping/provider ToS، المخاطر، صياغة العقد، آلية التوقف، والبدائل عند تعطل المصدر |
| GOV-03 | P1 | تحديد Controller/Processor roles | غير موجود | موثق لكل data flow مع العميل والمزودين؛ ينعكس في DPA والعقود |
| GOV-04 | P1 | Privacy Notice وDPA | غير موجود | وثائق معتمدة تصف البيانات، الأغراض، الحقوق، الاحتفاظ، الحذف، الأمن، الحوادث، والنقل خارج المملكة عند انطباقه |
| GOV-05 | P1 | Subprocessor Register | غير موجود | Railway/Cloudflare/Apify/Anthropic/Resend وأي analytics؛ الغرض والمنطقة والبيانات والإشعار بالتغيير |
| GOV-06 | P1 | Data Subject Rights Workflow | غير موجود | access/correction/deletion/export requests؛ تحقق هوية، SLA قانوني معتمد، سجل معالجة، واستثناءات موثقة |
| GOV-07 | P1 | Transfer/Residency Assessment | غير موجود | خريطة مواقع المعالجة والنقل؛ الأساس والضمانات التعاقدية المطلوبة قبل تشغيل العميل |
| GOV-08 | P1 | Breach Notification Procedure | غير موجود | قرار قانوني وتشغيلي، contacts، evidence preservation، قوالب وإطار زمني حسب المتطلبات المنطبقة |
| GOV-09 | P1 | Access Review دوري | غير موجود | مراجعة مستخدمي العملاء وموظفي المورد والوصول للبنية؛ إزالة الوصول غير المطلوب وتوثيق الاعتماد |
| GOV-10 | P2 | Compliance Evidence Pack | غير موجود | سياسات، diagrams، controls، pentest summary، backup/DR evidence، subprocessors، questionnaires، وmapping مناسب لـNCA ECC عند انطباقه |

### 5.10 الاشتراكات، الخطط، التراخيص، والفوترة

| ID | الأولوية | المتطلب | الحالة | معيار القبول والدليل المطلوب |
|---|---:|---|---|---|
| ENT-01 | P0 | مصدر واحد للحقيقة للـEntitlements | غير موجود | plan يحدد competitors، users، providers، polling frequency، exports، retention، budget؛ التطبيق يفرضها ولا يكتفي بعرض label |
| ENT-02 | P0 | فصل license state عن data retention | جزئي | حالات active/grace/suspended/expired/terminated؛ توثيق ماذا يحدث للدخول والjobs والبيانات بكل حالة |
| ENT-03 | P1 | سجل تعاقد وفوترة | غير موجود | contract ID، PO/invoice، term، renewal، price، discount approval، plan، contacts؛ يمكن أن يبقى خارج التطبيق لكن يجب أن يكون system of record |
| ENT-04 | P1 | Renewal workflow | جزئي | تنبيهات داخلية وللعميل، owner، grace policy، عدم المفاجأة بالإيقاف، وتوثيق كل تغيير |
| ENT-05 | P1 | Usage/Cost Metering | جزئي | provider actual/estimated cost، storage، compute، support، وlimits لكل instance؛ reconciliation شهري |
| ENT-06 | P1 | Discount Authority وPricing Governance | غير مثبت | list/target/floor، صلاحية الخصم، exception approval، وتسجيل سبب كل استثناء |
| ENT-07 | P2 | Automated provisioning from closed-won | غير موجود | عقد/CRM event ينشئ checklist/infra/config دون نسخ أسرار يدوياً، مع approvals حيث يلزم |

### 5.11 تجربة العميل، الإدارة، والدعم

| ID | الأولوية | المتطلب | الحالة | معيار القبول والدليل المطلوب |
|---|---:|---|---|---|
| CUS-01 | P0 | Onboarding checklist قابل للتكرار | جزئي | owner، brands/IDs، users، storage، providers، baseline pull، validation، training، sign-off؛ دليل من عميل تجريبي فعلي |
| CUS-02 | P0 | إظهار صحة التغطية داخل المنتج | جزئي | آخر نجاح لكل source/brand، freshness، partial/truncated، source outage، next retry؛ لا تُعرض فترة هادئة كأنها no activity |
| CUS-03 | P1 | Admin experience آمنة | جزئي | confirmations للعمليات الحساسة، validation واضح، audit، help text، وعدم كشف stack traces أو أسرار |
| CUS-04 | P1 | Notification preferences | غير موجود | اختيار email/in-app والتنبيهات؛ منع spam؛ delivery status وإعادة المحاولة |
| CUS-05 | P1 | Support model | غير موجود | قنوات الدعم، ساعات الخدمة، severity، response/escalation، ownership، وحفظ تاريخ التذاكر |
| CUS-06 | P1 | Customer-facing SLA | غير موجود | تعريف availability والاستثناءات والصيانة والدعم وRPO/RTO وservice credits إن اعتمدت تجارياً |
| CUS-07 | P1 | Export and portability | جزئي | تصدير بيانات ووسائط وتقارير بصيغ متفق عليها، authorization، limits، audit، وعدم استنزاف موارد الخدمة |
| CUS-08 | P1 | Offboarding | غير موجود | handover/export، revoke users/secrets، retention window، purge، وإثبات الإكمال |
| CUS-09 | P2 | In-product help and release notes | جزئي | methodology، coverage، limitations، تغييرات المنتج، وإرشادات المسؤول داخل النسخة |

### 5.12 الأداء، السعة، وإدارة التكلفة

| ID | الأولوية | المتطلب | الحالة | معيار القبول والدليل المطلوب |
|---|---:|---|---|---|
| PERF-01 | P0 | Baseline أداء Production-like | غير موجود | قياس dashboard وbrand page وPDF وZIP وjobs بحجم عميل الحد الأعلى؛ حفظ النتائج والبيئة |
| PERF-02 | P0 | حماية الموارد | جزئي | timeouts، payload/upload/download limits، concurrency limits، streaming، وحماية من query/export abuse |
| PERF-03 | P1 | Capacity Model لكل instance | غير موجود | CPU/RAM/DB/storage/provider حجم متوقع وحدود إنذار ومسار ترقية |
| PERF-04 | P1 | Database performance review | غير مثبت | slow-query logging، indexes مبنية على workload حقيقي، connection limits، واختبار migration على حجم مستهدف |
| PERF-05 | P1 | Cost observability | جزئي | تكلفة كل tenant/source/job/GB/support؛ budget variance وتنبيه؛ actual مقابل modeled |
| PERF-06 | P2 | Fleet economies and automation | غير موجود | قياس وقت provisioning/support/update؛ تقليل العمل اليدوي مع نمو العملاء دون إضعاف العزل |

### 5.13 سهولة الاستخدام، الوصول، واللغات

| ID | الأولوية | المتطلب | الحالة | معيار القبول والدليل المطلوب |
|---|---:|---|---|---|
| UX-01 | P1 | تكافؤ العربية والإنجليزية | جزئي | لا نصوص حرجة بلغة واحدة؛ RTL/LTR صحيح؛ date/number/currency locale؛ اختبارات snapshots للمسارات الرئيسية وPDF |
| UX-02 | P1 | Accessibility baseline | غير مثبت | Keyboard navigation، focus، labels، contrast، reduced motion، screen reader؛ فحص آلي ومراجعة يدوية وفق معيار معتمد |
| UX-03 | P1 | حالات empty/loading/error/degraded | جزئي | كل شاشة توضح الفرق بين no data وnot configured وsource failed وpartial وno activity |
| UX-04 | P1 | Mobile/responsive verification | غير مثبت | smoke test على أحجام معتمدة؛ الإجراءات الأساسية والجداول والتقارير قابلة للاستخدام |
| UX-05 | P2 | Design system قابل للصيانة | جزئي | tokens/components/interaction patterns موحدة؛ visual regression للواجهات الحرجة |

### 5.14 تحليلات المنتج وإدارة القيمة

| ID | الأولوية | المتطلب | الحالة | معيار القبول والدليل المطلوب |
|---|---:|---|---|---|
| ANA-01 | P1 | Telemetry تشغيلية ومنتجية تحترم الخصوصية | غير موجود | login success، active users، brief views/exports، archive usage، feature adoption؛ دون إرسال محتوى العميل لطرف ثالث بلا اعتماد |
| ANA-02 | P1 | Customer Health Score | غير موجود | freshness، failures، usage، unresolved setup، storage/backup/license؛ يراه فريق التشغيل قبل أن يشتكي العميل |
| ANA-03 | P1 | قياس القيمة في الـPilot | غير موجود | baseline للعمل اليدوي، time saved، discoveries، action taken، brief usefulness، renewal intent؛ تقرير قرار بعد التجربة |
| ANA-04 | P2 | Feature flags/experiments governance | غير موجود | فرضية وmetric ومدة وowner؛ لا تجارب تغير استنتاجات العميل دون إفصاح |

### 5.15 مخاطر المزودين والأطراف الثالثة

| ID | الأولوية | المتطلب | الحالة | معيار القبول والدليل المطلوب |
|---|---:|---|---|---|
| VEN-01 | P0 | Register للمزودين واعتمادهم | جزئي | الخدمة، البيانات، المنطقة، credentials، التكلفة، SLA، DPA/terms، owner، البديل، وتاريخ المراجعة |
| VEN-02 | P0 | Exit/Fallback لخدمات البيانات الحرجة | جزئي | adapters قابلة للاستبدال فعلاً؛ fixture contract tests؛ runbook للتحويل؛ degraded mode صادق عند غياب البديل |
| VEN-03 | P1 | Provider SLA and change monitoring | غير موجود | رصد تغييرات API/actor/schema/pricing/terms؛ owner وتنبيه واختبار regression قبل اعتماد التغيير |
| VEN-04 | P1 | تقليل البيانات المرسلة للمزودين | غير مثبت | توثيق payloads؛ إرسال الحد الأدنى؛ منع إرسال بيانات عميل أو مستخدم غير لازمة إلى AI/scraping vendors |
| VEN-05 | P1 | Reconciliation وفواتير المزودين | غير موجود | مطابقة run IDs والusage logs بالفاتورة؛ كشف الفشل المدفوع والـzero-results والانحراف عن السقف |

---

## 6. بوابات الجاهزية الرسمية

### Gate A — السماح بـControlled External Pilot

لا يبدأ Pilot خارجي حتى تتحقق جميع البنود التالية:

- [ ] إغلاق جميع متطلبات P0 في IAM وSEC.
- [ ] إصلاح DAT-02 وإضافة DAT-03 واختبار الفشل والتعطيل والـcaps.
- [ ] تنفيذ Paid Live Pull وتقرير DAT-05.
- [ ] تشغيل R2/S3 فعلي لكل عميل واجتياز isolation test.
- [ ] نسخ DB احتياطي واستعادة ناجحة موثقة.
- [ ] Job locking وrecovery وretry/backoff.
- [ ] External monitoring وتنبيهات freshness/error/backup.
- [ ] CI غير تفاعلي يشمل lint/tests/build/security scans.
- [ ] مراجعة قانونية لاستخدام مزودي scraping وشروط العقد.
- [ ] Entitlements فعلية للخطة، وليس hard-coded cap أو label فقط.
- [ ] Onboarding وsupport/escalation contacts وoffboarding path.

**دليل الخروج:** ملف `PILOT_READINESS_EVIDENCE.md` مرتبط بإصدار محدد، ويحتوي روابط نتائج الاختبارات والموافقات وأي مخاطر مقبولة بمالك وتاريخ انتهاء.

### Gate B — قبول الـPilot واعتباره منتجاً قابلاً للبيع

- [ ] تشغيل مستقر طوال مدة التجربة المتفق عليها.
- [ ] لا توجد حالات False “Stopped/Inactive” غير مفسرة في عينة التحقق.
- [ ] coverage/freshness موضحة في كل تقرير رئيسي.
- [ ] قياس actual provider/hosting/support cost.
- [ ] Restore Drill ناجح خلال الـPilot.
- [ ] Incident simulation واختبار اتصالات العميل.
- [ ] Product value report يثبت الاستخدام والقرارات أو الوقت الموفر.
- [ ] Pricing وpackage boundaries معتمدة بناءً على willingness-to-pay.
- [ ] العميل يوقع على coverage limitations وdata-processing terms.

### Gate C — General Availability للمؤسسات

- [ ] جميع P1 مكتملة أو لها risk acceptance رسمي محدود المدة.
- [ ] SSO/MFA وAudit Trail وAccess Reviews.
- [ ] SLO/SLA ودعم وتصعيد وStatus Page.
- [ ] IaC وfleet inventory وcanary/rollback.
- [ ] Penetration Test مستقل وإعادة اختبار ناجحة.
- [ ] Privacy/DPA/Subprocessor/Retention/Incident pack.
- [ ] Capacity وload tests على حجم الخطة الأعلى.
- [ ] Provisioning وrenewal/offboarding مجربة من البداية إلى النهاية.
- [ ] SBOM وdependency/security maintenance process.

---

## 7. ترتيب التنفيذ الموصى به

### المرحلة 0 — حماية الثقة والبيانات

1. **SEC-01 إلى SEC-07 + IAM-01 إلى IAM-04:** تحديث التبعيات، إصلاح المصادقة، rate limiting، authorization tests، media privacy وSSRF.
2. **DAT-01 إلى DAT-08:** إعادة تصميم observation/status/coverage semantics قبل جمع تاريخ جديد قد يصبح مضللاً.
3. **STO-01 إلى STO-04:** تخزين دائم، نسخ احتياطي، restore، واعتماد RPO/RTO.
4. **JOB-01 إلى JOB-05 + OBS-01 إلى OBS-04:** locking، retry، recovery، health، logs، alerts.
5. **SDLC-01 إلى SDLC-05:** CI واختبارات المنطق الحرج والتكامل والـE2E.
6. **GOV-01 وGOV-02 + VEN-01 وVEN-02:** خريطة البيانات ومراجعة قانونية واعتماد المزود وخطة التعطل.
7. **ENT-01 وENT-02 + CUS-01 وCUS-02:** فرض الخطة وتجربة onboarding وصحة التغطية.
8. **DAT-05 وPERF-01:** Live Pilot تقني داخلي قبل إدخال Design Partner.

### المرحلة 1 — تشغيل Design Partner

1. Audit Trail وSSO/MFA حسب متطلبات العميل.
2. دعم، Incident Response، Access Reviews، وCustomer Health.
3. DPA/Privacy/Subprocessor/Retention/Transfer assessment.
4. قياس cost/value/usage وجودة البيانات.
5. إغلاق العيوب المكتشفة ثم اجتياز Gate B.

### المرحلة 2 — الإطلاق العام

1. IaC وfleet inventory وrelease canary/rollback.
2. SLA/SLO وStatus Page وsupport operating model.
3. Penetration test وCompliance Evidence Pack.
4. أتمتة provisioning/renewal/offboarding.
5. اعتماد السعر والخطط بناءً على نتائج فعلية.

### المرحلة 3 — التوسع

1. Control Plane مركزي.
2. Feature flags وإدارة إصدارات متعددة عند الحاجة.
3. API/integrations وفق طلب العملاء المثبت، لا كافتراض مسبق.
4. تحسين اقتصاديات الأسطول وتقليل العمل التشغيلي اليدوي.

---

## 8. Definition of Done لأي متطلب

لا يُغلق أي Requirement أو Issue إلا عند تحقق ما ينطبق من الآتي:

- [ ] المتطلب وسيناريوهات الفشل موثقة.
- [ ] Threat/security/privacy impact تمت مراجعته.
- [ ] الكود خضع لمراجعة مستقلة.
- [ ] Unit/Integration/E2E tests أضيفت ونجحت.
- [ ] CI نجح على clean environment.
- [ ] Migration وrollback أو recovery path اختُبرت.
- [ ] Logs/metrics/alerts أضيفت بحيث يمكن اكتشاف فشل الميزة.
- [ ] Runbook ودليل الدعم محدثان.
- [ ] دليل القبول محفوظ باسم الإصدار والبيئة والتاريخ.
- [ ] `docs/STATUS.md` و`docs/CHANGELOG.md` محدثان في نفس التغيير.
- [ ] لا توجد أرقام أو حالات نجاح معلنة دون مصدر أو قياس.

---

## 9. نموذج سجل التنفيذ

يُنشأ سجل مركزي، سواء في GitHub Projects أو Jira أو Linear، بهذه الحقول الإلزامية:

| الحقل | المطلوب |
|---|---|
| Requirement ID | مثل `DAT-02`، ثابت ولا يعاد استخدامه |
| Owner | شخص واحد مسؤول عن الإغلاق |
| Priority | P0/P1/P2 |
| Target Gate | Pilot / Beta Exit / GA / Scale |
| Design Link | ADR/PRD/Threat Model عند الحاجة |
| Implementation PR | رابط التغيير |
| Test Evidence | CI run، report، screenshot، log، restore record |
| Monitoring | metric/alert/dashboard/runbook |
| Security/Privacy Review | Not required أو reviewer + date |
| Residual Risk | وصف، approver، expiry date |
| Status | Not started / In progress / Blocked / Verified |

### قاعدة الحوكمة

عبارة “تم التطوير” لا تعني “تم التحقق”. الحالة النهائية الوحيدة التي تسمح بإغلاق المتطلب هي **Verified** مع دليل يمكن إعادة تشغيله أو مراجعته.

---

## 10. مؤشرات الإدارة التي يجب متابعتها

لا تحدد الأهداف الرقمية قبل قياس baseline، لكن يجب جمع المؤشرات التالية منذ الـPilot:

### موثوقية الخدمة

- Availability لكل instance.
- Web/API/PDF latency.
- Job success/partial/failure rate.
- Ingestion freshness لكل brand/provider.
- Mean time to detect وmean time to recover.
- Backup success وrestore test result.

### جودة البيانات

- Ads observed مقابل عينة ground truth.
- Truncated/partial pulls.
- False active/inactive transitions.
- Duplicate rate.
- Missing/unarchived assets.
- Provider schema changes.

### الأمن

- Open vulnerabilities حسب severity والعمر.
- Failed logins وrate-limit events.
- Privileged actions وaccess review findings.
- Secret age/rotation state.
- Security incident count وclosure time.

### الاقتصاد والقيمة

- Actual COGS لكل instance/provider.
- Support hours لكل عميل.
- Provisioning time.
- Weekly brief views/exports.
- Archive downloads واستخدام التحليلات.
- قرارات أو إجراءات العميل الناتجة من المنصة.
- Renewal intent وwillingness-to-pay.

---

## 11. القرارات التي تحتاج اعتماد المالك

هذه البنود لا ينبغي أن يقررها المطور منفرداً:

1. قيم SLO/SLA وRPO/RTO.
2. ما إذا كان SSO ضمن Standard أو Enterprise فقط.
3. مدة الاحتفاظ بالبيانات بعد انتهاء الترخيص.
4. المناطق المسموحة لاستضافة ومعالجة بيانات العملاء.
5. حدود كل خطة: منافسون، مستخدمون، مزودون، polling، retention، exports، support.
6. سياسة التعويض أو التواصل عند تعطل مصدر بيانات خارجي.
7. وصف المنتج التجاري: يجب تجنب “real-time” و“complete coverage” ما لم يثبتا تقنياً.
8. ما إذا كان العميل يملك نسخة منفصلة في حساب المورد أو في حساب سحابي مخصص له.
9. المخاطر المقبولة قانونياً وتعاقدياً لاستخدام scraping providers.

---

## 12. المراجع المعتمدة

يُستخدم ما يلي كمرجع لبناء controls والتحقق، لا كشهادات امتثال حصل عليها المنتج:

- [OWASP Application Security Verification Standard 5.0.0](https://owasp.org/www-project-application-security-verification-standard/) — خط أساس للتحقق من ضوابط أمن تطبيقات الويب.
- [NIST Secure Software Development Framework SP 800-218 v1.1](https://csrc.nist.gov/pubs/sp/800/218/final) — ممارسات تطوير برمجي آمن داخل دورة حياة المنتج.
- [NIST Cybersecurity Framework 2.0](https://www.nist.gov/cyberframework) — إدارة مخاطر الأمن السيبراني والحوكمة والاستجابة والتعافي.
- [NCA Essential Cybersecurity Controls ECC 2-2024](https://nca.gov.sa/en/regulatory-documents/controls-list/ecc/) — مرجع سعودي لتقييم الضوابط ذات الصلة، مع تحديد الانطباق حسب الجهة والعميل.
- [SDAIA — Guide to the Saudi Personal Data Protection Law](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/GPDPL/) — حوكمة البيانات الشخصية، الإشعارات، الحقوق، الاحتفاظ، الحوادث والنقل.

### مراجع المشروع الداخلية

- `AGENTS.md`
- `README.md`
- `docs/TECHNICAL_SERVICES_REQUIREMENTS_AR.md`
- `docs/STATUS.md`
- `docs/VERIFICATION.md`
- `docs/LAUNCH_PLAN.md`
- `docs/DECISIONS.md`
- `src/auth.ts`
- `src/middleware.ts`
- `src/jobs/runner.ts`
- `src/jobs/adsPoll.ts`
- `src/lib/providers/ads/*`
- `src/lib/storage.ts`
- `src/app/media/[...key]/route.ts`
- `prisma/schema.prisma`

---

## 13. الخلاصة

الأساس القوي لـAdSniper لا يعني إضافة أكبر عدد من المميزات. الأولوية هي أن تكون المنصة:

1. **آمنة:** هوية فردية، صلاحيات دقيقة، تبعيات محدثة، أسرار محمية، واختبارات أمنية.
2. **صادقة:** لا تفسر غياب البيانات على أنه توقف حملة، ولا تخلط partial مع complete أو modeled مع observed.
3. **قابلة للاستعادة:** نسخ احتياطية مجربة ووسائط دائمة وخطة تعافٍ.
4. **قابلة للتشغيل:** jobs موثوقة، مراقبة وتنبيهات، runbooks، ودعم واضح.
5. **قابلة للتكرار:** provisioning وإصدارات وعزل وإدارة أسطول دون معرفة ضمنية لدى شخص واحد.
6. **قابلة للتعاقد:** خطط وentitlements وخصوصية ومزودون وSLA وحدود تغطية واضحة.
7. **مثبتة القيمة:** بيانات حية وجودة قابلة للقياس واستخدام فعلي واستعداد للدفع.

إغلاق متطلبات P0 هو الحد الأدنى لبدء Pilot خارجي. إغلاق P1 وإثبات Gate B هو الحد الأدنى لتسويق AdSniper كمنتج SaaS مؤسسي جاهز.
