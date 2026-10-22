export type ToolCategory =
  | "convert" | "edit" | "compress" | "advanced" | "pdf" | "documents" | "audio" | "video" | "files";

export type PlannedTool = {
  slug: string;
  name: string;
  category: ToolCategory;
  categoryLabel: string;
  iconLabel: string;
  description: string;
  priority: "next" | "later";
};

/** Central directory for planned tools. A listing is not a claim that processing works. */
export const plannedTools: PlannedTool[] = [
  { slug: "image-metadata", name: "إزالة بيانات الصورة", category: "edit", categoryLabel: "تحرير الصور", iconLabel: "EXIF", description: "مراجعة بيانات الصورة الوصفية وإزالة البيانات الشخصية عند الحاجة.", priority: "later" },
  { slug: "image-watermark", name: "إضافة علامة مائية", category: "edit", categoryLabel: "تحرير الصور", iconLabel: "WM", description: "إضافة نص أو علامة مائية إلى الصور مع ضبط موضعها.", priority: "later" },
  { slug: "image-compare", name: "مقارنة قبل وبعد", category: "edit", categoryLabel: "تحرير الصور", iconLabel: "↔", description: "عرض الصورة الأصلية والنتيجة جنبًا إلى جنب للمراجعة.", priority: "next" },
  { slug: "image-to-pdf", name: "تحويل الصور إلى PDF", category: "pdf", categoryLabel: "أدوات PDF", iconLabel: "PDF", description: "جمع صورة واحدة أو عدة صور في ملف PDF.", priority: "next" },
  { slug: "pdf-to-images", name: "تحويل PDF إلى صور", category: "pdf", categoryLabel: "أدوات PDF", iconLabel: "PDF", description: "تصدير صفحات PDF كصور بعد تحديد الصيغ المدعومة واختبارها.", priority: "next" },
  { slug: "pdf-merge", name: "دمج ملفات PDF", category: "pdf", categoryLabel: "أدوات PDF", iconLabel: "PDF", description: "جمع عدة ملفات PDF في مستند واحد مع ترتيب الصفحات.", priority: "later" },
  { slug: "pdf-split", name: "تقسيم PDF", category: "pdf", categoryLabel: "أدوات PDF", iconLabel: "PDF", description: "استخراج صفحات محددة أو تقسيم المستند إلى ملفات أصغر.", priority: "later" },
  { slug: "pdf-compress", name: "ضغط PDF", category: "compress", categoryLabel: "ضغط الملفات", iconLabel: "PDF", description: "تقليل حجم PDF مع توضيح أثر الضغط في الجودة.", priority: "later" },
  { slug: "pdf-rotate", name: "تدوير صفحات PDF", category: "pdf", categoryLabel: "أدوات PDF", iconLabel: "PDF", description: "تدوير صفحات المستند قبل حفظ نسخة معدلة.", priority: "later" },
  { slug: "word-to-pdf", name: "تحويل Word إلى PDF", category: "documents", categoryLabel: "المستندات", iconLabel: "DOC", description: "تحويل مستندات Word إلى PDF بعد تحديد طريقة المعالجة المناسبة.", priority: "later" },
  { slug: "pdf-to-word", name: "تحويل PDF إلى Word", category: "documents", categoryLabel: "المستندات", iconLabel: "DOC", description: "استخراج محتوى PDF إلى مستند قابل للتحرير مع توضيح حدود التنسيق.", priority: "later" },
  { slug: "excel-to-pdf", name: "تحويل Excel إلى PDF", category: "documents", categoryLabel: "المستندات", iconLabel: "XLS", description: "تجهيز جداول البيانات للتصدير إلى PDF.", priority: "later" },
  { slug: "powerpoint-to-pdf", name: "تحويل PowerPoint إلى PDF", category: "documents", categoryLabel: "المستندات", iconLabel: "PPT", description: "تصدير العروض التقديمية إلى PDF مع الحفاظ على ترتيب الشرائح قدر الإمكان.", priority: "later" },
  { slug: "audio-convert", name: "تحويل صيغ الصوت", category: "audio", categoryLabel: "الصوت", iconLabel: "AUDIO", description: "تحويل الملفات الصوتية بين الصيغ التي سيُثبت دعمها بالاختبارات.", priority: "later" },
  { slug: "audio-compress", name: "ضغط الصوت", category: "compress", categoryLabel: "ضغط الملفات", iconLabel: "AUDIO", description: "تقليل حجم الملفات الصوتية مع خيارات جودة واضحة.", priority: "later" },
  { slug: "extract-audio", name: "استخراج الصوت من الفيديو", category: "audio", categoryLabel: "الصوت", iconLabel: "AUDIO", description: "استخراج المسار الصوتي من ملفات الفيديو المدعومة.", priority: "later" },
  { slug: "video-convert", name: "تحويل صيغ الفيديو", category: "video", categoryLabel: "الفيديو", iconLabel: "VIDEO", description: "تحويل الفيديو بين الصيغ التي ستُختبر فعليًا قبل إعلان دعمها.", priority: "later" },
  { slug: "video-compress", name: "ضغط الفيديو", category: "compress", categoryLabel: "ضغط الملفات", iconLabel: "VIDEO", description: "تقليل حجم الفيديو مع بيان أثر ذلك في الدقة والجودة.", priority: "later" },
  { slug: "video-trim", name: "قص الفيديو", category: "video", categoryLabel: "الفيديو", iconLabel: "VIDEO", description: "تحديد بداية الفيديو ونهايته ثم تصدير المقطع المطلوب.", priority: "later" },
  { slug: "zip-create", name: "ضغط الملفات إلى ZIP", category: "files", categoryLabel: "الملفات والأرشيف", iconLabel: "ZIP", description: "جمع ملفات متعددة في أرشيف واحد.", priority: "later" },
  { slug: "zip-extract", name: "فك ضغط ZIP", category: "files", categoryLabel: "الملفات والأرشيف", iconLabel: "ZIP", description: "استعراض محتويات أرشيف ZIP واستخراج الملفات المختارة.", priority: "later" }
];
