import 'package:material_ui/material_ui.dart';

import 'compose_post.dart';
import 'pick_files.dart';
import 'school_api.dart';

/// Teachers post homework or an exam. It appears in Classwork and as a post on Home.
class ClassworkForm extends StatefulWidget {
  const ClassworkForm({
    super.key,
    required this.classId,
    required this.today,
    required this.arabic,
    required this.submit,
  });

  final Object classId;
  final String today;
  final bool arabic;
  final Future<bool> Function(SchoolRow) submit;

  @override
  State<ClassworkForm> createState() => _ClassworkFormState();
}

class _ClassworkFormState extends State<ClassworkForm> {
  final form = GlobalKey<FormState>();
  final title = TextEditingController();
  final details = TextEditingController();
  late DateTime date = DateTime.parse(widget.today);
  String type = 'homework';
  List<PickedFile> photos = [];
  bool saving = false;

  String tr(String en, String ar) => widget.arabic ? ar : en;
  String get dueDate => date.toIso8601String().split('T').first;

  @override
  void dispose() {
    title.dispose();
    details.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (saving || form.currentState?.validate() != true) return;
    setState(() => saving = true);
    final saved = await widget.submit({
      'classId': widget.classId,
      'type': type,
      'title': title.text.trim(),
      'details': details.text.trim(),
      'dueDate': dueDate,
      'photos': photos.map((photo) => photo.data).toList(),
    });
    if (!mounted) return;
    setState(() => saving = false);
    if (saved) {
      title.clear();
      details.clear();
      setState(() => photos = []);
    }
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(saved
          ? tr('Posted. Families see it in Classwork and on Home.', 'تم النشر. يراه أولياء الأمور في أعمال الصف وفي الرئيسية.')
          : tr('Not posted. Check your connection and try again.', 'لم يُنشر. تحقق من الاتصال وحاول مرة أخرى.')),
    ));
  }

  Future<void> chooseDate() async {
    final first = DateTime.parse(widget.today);
    final selected = await showDatePicker(
      context: context,
      initialDate: date,
      firstDate: first,
      lastDate: DateTime(first.year + 2, first.month, first.day),
    );
    if (mounted && selected != null) setState(() => date = selected);
  }

  @override
  Widget build(BuildContext context) => Form(
    key: form,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Icon(Icons.edit_note_outlined, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 8),
            Expanded(child: Text(tr('Post classwork', 'انشر أعمال الصف'), style: Theme.of(context).textTheme.titleLarge)),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          tr('Families in the school community can see this post. Leave out student names and grades.',
              'يرى أعضاء مجتمع المدرسة هذا المنشور. تجنّب ذكر أسماء الطلاب ودرجاتهم.'),
        ),
        const SizedBox(height: 12),
        SegmentedButton<String>(
          segments: [
            ButtonSegment(value: 'homework', label: Text(tr('Homework', 'واجب')), icon: const Icon(Icons.menu_book_outlined)),
            ButtonSegment(value: 'exam', label: Text(tr('Exam', 'اختبار')), icon: const Icon(Icons.quiz_outlined)),
          ],
          selected: {type},
          onSelectionChanged: saving ? null : (value) => setState(() => type = value.first),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: title,
          maxLength: 120,
          enabled: !saving,
          decoration: InputDecoration(labelText: tr('Title', 'العنوان'), border: const OutlineInputBorder()),
          validator: (value) => value == null || value.trim().isEmpty ? tr('Required', 'مطلوب') : null,
        ),
        TextFormField(
          controller: details,
          maxLength: 1000,
          minLines: 2,
          maxLines: 4,
          enabled: !saving,
          decoration: InputDecoration(labelText: tr('Instructions', 'التعليمات'), border: const OutlineInputBorder()),
        ),
        PhotoPickerRow(photos: photos, arabic: widget.arabic, enabled: !saving, onChanged: (list) => setState(() => photos = list)),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: saving ? null : chooseDate,
          icon: const Icon(Icons.event),
          label: Text('${tr('Due', 'التسليم')} · $dueDate'),
        ),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: saving ? null : save,
          child: Text(saving ? tr('Posting…', 'جارٍ النشر…') : tr('Publish classwork', 'نشر أعمال الصف')),
        ),
      ],
    ),
  );
}
