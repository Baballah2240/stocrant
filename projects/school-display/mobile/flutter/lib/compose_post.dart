import 'package:material_ui/material_ui.dart';

import 'pick_files.dart';

const maxPostPhotos = 6;

/// Photo thumbnails with an add tile. Shared by posts and classwork.
class PhotoPickerRow extends StatelessWidget {
  const PhotoPickerRow({
    super.key,
    required this.photos,
    required this.onChanged,
    required this.arabic,
    this.enabled = true,
  });

  final List<PickedFile> photos;
  final ValueChanged<List<PickedFile>> onChanged;
  final bool arabic;
  final bool enabled;

  String tr(String en, String ar) => arabic ? ar : en;

  Future<void> add(BuildContext context) async {
    try {
      final picked = await pickPhotos(maxPostPhotos - photos.length);
      if (picked.isNotEmpty) onChanged([...photos, ...picked]);
    } on PickProblem catch (problem) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(problem.tooLarge
            ? tr('Each photo must be 5 MB or smaller.', 'يجب ألا تتجاوز كل صورة ٥ ميغابايت.')
            : tr('Choose PNG, JPEG or WebP photos.', 'اختر صورًا بصيغة PNG أو JPEG أو WebP.')),
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return SizedBox(
      height: 92,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          for (final (index, photo) in photos.indexed)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 8),
              child: Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: Image.memory(photo.bytes, width: 88, height: 88, fit: BoxFit.cover,
                        semanticLabel: tr('Photo ${index + 1}', 'الصورة ${index + 1}')),
                  ),
                  PositionedDirectional(
                    top: 2,
                    end: 2,
                    child: IconButton.filled(
                      visualDensity: VisualDensity.compact,
                      iconSize: 16,
                      tooltip: tr('Remove photo', 'إزالة الصورة'),
                      onPressed: enabled ? () => onChanged([...photos]..removeAt(index)) : null,
                      icon: const Icon(Icons.close),
                    ),
                  ),
                ],
              ),
            ),
          if (photos.length < maxPostPhotos)
            Material(
              color: colors.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(14),
              child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: enabled ? () => add(context) : null,
                child: SizedBox(
                  width: 88,
                  height: 88,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.add_photo_alternate_outlined, color: colors.primary),
                      const SizedBox(height: 4),
                      Text('${photos.length}/$maxPostPhotos', style: Theme.of(context).textTheme.labelSmall),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Full-screen form for a teacher announcement in the school feed.
class ComposePostPage extends StatefulWidget {
  const ComposePostPage({super.key, required this.arabic, required this.submit});

  final bool arabic;
  final Future<bool> Function({required String title, required String text, required List<String> photos}) submit;

  @override
  State<ComposePostPage> createState() => _ComposePostPageState();
}

class _ComposePostPageState extends State<ComposePostPage> {
  final form = GlobalKey<FormState>();
  final title = TextEditingController();
  final text = TextEditingController();
  List<PickedFile> photos = [];
  bool saving = false;

  String tr(String en, String ar) => widget.arabic ? ar : en;

  @override
  void dispose() {
    title.dispose();
    text.dispose();
    super.dispose();
  }

  Future<void> publish() async {
    if (saving || form.currentState?.validate() != true) return;
    setState(() => saving = true);
    final ok = await widget.submit(
      title: title.text.trim(),
      text: text.text.trim(),
      photos: photos.map((photo) => photo.data).toList(),
    );
    if (!mounted) return;
    setState(() => saving = false);
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(tr('The post was not published. Check your connection and try again.',
            'لم يُنشر المنشور. تحقق من الاتصال وحاول مرة أخرى.')),
      ));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(tr('New post', 'منشور جديد')),
      actions: [
        Padding(
          padding: const EdgeInsetsDirectional.only(end: 12),
          child: FilledButton(
            onPressed: saving ? null : publish,
            child: Text(saving ? tr('Publishing…', 'جارٍ النشر…') : tr('Publish', 'نشر')),
          ),
        ),
      ],
    ),
    body: SafeArea(
      child: Form(
        key: form,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              tr('Parents and teachers see this in the Home tab. Leave out student names and grades.',
                  'يرى أولياء الأمور والمعلمون هذا في الصفحة الرئيسية. تجنّب ذكر أسماء الطلاب ودرجاتهم.'),
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: title,
              enabled: !saving,
              maxLength: 120,
              decoration: InputDecoration(labelText: tr('Title (optional)', 'العنوان (اختياري)'), border: const OutlineInputBorder()),
            ),
            TextFormField(
              controller: text,
              enabled: !saving,
              maxLength: 1800,
              minLines: 4,
              maxLines: 10,
              decoration: InputDecoration(labelText: tr('What would you like to share?', 'ماذا تريد أن تشارك؟'), border: const OutlineInputBorder(), alignLabelWithHint: true),
              validator: (value) => value == null || value.trim().isEmpty ? tr('Write a message for families.', 'اكتب رسالة لأولياء الأمور.') : null,
            ),
            const SizedBox(height: 8),
            Text(tr('Photos', 'الصور'), style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            PhotoPickerRow(photos: photos, arabic: widget.arabic, enabled: !saving, onChanged: (list) => setState(() => photos = list)),
          ],
        ),
      ),
    ),
  );
}
