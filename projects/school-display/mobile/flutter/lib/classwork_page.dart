import 'package:material_ui/material_ui.dart';

import 'bento.dart';
import 'classwork_form.dart';
import 'pick_files.dart';
import 'school_api.dart';

String nameOf(SchoolRow row, bool arabic) => localizedValue(row, 'name', arabic);

/// Choosing a class (teacher) or a child (parent) above a tab.
class ChoiceStrip extends StatelessWidget {
  const ChoiceStrip({super.key, required this.options, required this.selected, required this.onSelected, required this.label});

  final List<({Object id, String label})> options;
  final Object? selected;
  final ValueChanged<Object> onSelected;
  final String label;

  @override
  Widget build(BuildContext context) {
    if (options.length < 2) return const SizedBox.shrink();
    return Semantics(
      label: label,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final option in options)
              Padding(
                padding: const EdgeInsetsDirectional.only(end: 8),
                child: ChoiceChip(
                  label: Text(option.label),
                  selected: option.id == selected,
                  onSelected: (_) => onSelected(option.id),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class ClassworkPage extends StatelessWidget {
  const ClassworkPage({
    super.key,
    required this.data,
    required this.parent,
    required this.arabic,
    required this.selection,
    required this.onSelect,
    required this.refresh,
    required this.postWork,
    required this.removeWork,
    required this.submitFile,
    required this.openSubmission,
    required this.linkChild,
  });

  final SchoolData data;
  final bool parent;
  final bool arabic;
  final Object? selection;
  final ValueChanged<Object> onSelect;
  final Future<void> Function() refresh;
  final Future<bool> Function(SchoolRow) postWork;
  final Future<bool> Function(String id) removeWork;
  final Future<bool> Function(String workId, String studentId, PickedFile file) submitFile;
  final Future<void> Function(SchoolRow submission) openSubmission;
  final Future<bool> Function(String code) linkChild;

  String tr(String en, String ar) => arabic ? ar : en;

  List<({Object id, String label})> get options => parent
      ? [for (final child in data.rows('children')) (id: child['id'] as Object, label: nameOf(child, arabic))]
      : [
          for (final group in data.rows('classes'))
            if (data.assignedClasses.contains(group['id'])) (id: group['id'] as Object, label: nameOf(group, arabic)),
        ];

  @override
  Widget build(BuildContext context) {
    final choices = options;
    final chosen = choices.where((option) => option.id == selection).firstOrNull ?? choices.firstOrNull;
    final child = parent ? data.rows('children').where((row) => row['id'] == chosen?.id).firstOrNull : null;
    final classId = parent ? (child?['classId']) : chosen?.id;
    final items = data.rows('work').where((row) => row['classId'] == classId).toList()
      ..sort((a, b) => textValue(a, 'dueDate').compareTo(textValue(b, 'dueDate')));
    final inset = MediaQuery.sizeOf(context).width < 360 ? 12.0 : 20.0;
    return RefreshIndicator(
      onRefresh: refresh,
      child: ListView(
        padding: EdgeInsets.fromLTRB(inset, 12, inset, 96),
        children: [
          Text(parent ? tr('Homework and exams', 'الواجبات والاختبارات') : tr('Classwork', 'أعمال الصف'),
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          if (parent && choices.isEmpty)
            LinkChildCard(arabic: arabic, link: linkChild)
          else ...[
            ChoiceStrip(
              options: choices,
              selected: chosen?.id,
              onSelected: onSelect,
              label: parent ? tr('Child', 'الطفل') : tr('Class', 'الصف'),
            ),
            if (choices.length > 1) const SizedBox(height: 12),
            if (!parent && classId != null && DateTime.tryParse(data.today) != null) ...[
              Material(
                color: Theme.of(context).colorScheme.surfaceContainer,
                borderRadius: BorderRadius.circular(24),
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: ClassworkForm(
                    key: ValueKey(classId),
                    classId: classId,
                    today: data.today,
                    arabic: arabic,
                    submit: postWork,
                  ),
                ),
              ),
              const SizedBox(height: 18),
            ],
            if (items.isEmpty)
              BentoCard(
                tile: (
                  title: tr('Nothing posted yet', 'لا توجد أعمال بعد'),
                  detail: parent
                      ? tr('Homework and exams from teachers appear here.', 'تظهر هنا واجبات المعلمين واختباراتهم.')
                      : tr('Classwork you post appears here with files from parents.', 'تظهر هنا الأعمال التي تنشرها مع ملفات أولياء الأمور.'),
                  icon: Icons.assignment_outlined,
                ),
              )
            else
              for (final item in items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: WorkCard(
                    item: item,
                    arabic: arabic,
                    parent: parent,
                    childId: child?['id'] as String?,
                    submitFile: submitFile,
                    openSubmission: openSubmission,
                    removeWork: removeWork,
                  ),
                ),
          ],
        ],
      ),
    );
  }
}

class WorkCard extends StatefulWidget {
  const WorkCard({
    super.key,
    required this.item,
    required this.arabic,
    required this.parent,
    required this.childId,
    required this.submitFile,
    required this.openSubmission,
    required this.removeWork,
  });

  final SchoolRow item;
  final bool arabic;
  final bool parent;
  final String? childId;
  final Future<bool> Function(String workId, String studentId, PickedFile file) submitFile;
  final Future<void> Function(SchoolRow submission) openSubmission;
  final Future<bool> Function(String id) removeWork;

  @override
  State<WorkCard> createState() => _WorkCardState();
}

class _WorkCardState extends State<WorkCard> {
  bool uploading = false;

  String tr(String en, String ar) => widget.arabic ? ar : en;

  String size(int bytes) => bytes >= 1024 * 1024
      ? '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB'
      : '${(bytes / 1024).ceil()} KB';

  Future<void> upload() async {
    final childId = widget.childId;
    if (childId == null || uploading) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final file = await pickDocument();
      if (file == null) return;
      setState(() => uploading = true);
      final ok = await widget.submitFile(textValue(widget.item, 'id'), childId, file);
      messenger.showSnackBar(SnackBar(
        content: Text(ok
            ? tr('File sent to the teacher.', 'أُرسل الملف إلى المعلم.')
            : tr('The file was not sent. Try again.', 'لم يُرسل الملف. حاول مرة أخرى.')),
      ));
    } on PickProblem catch (problem) {
      messenger.showSnackBar(SnackBar(
        content: Text(problem.tooLarge
            ? tr('Choose a file of 5 MB or smaller.', 'اختر ملفًا لا يتجاوز ٥ ميغابايت.')
            : tr('Choose a PDF, photo, Word, Excel, PowerPoint or text file.', 'اختر ملف PDF أو صورة أو Word أو Excel أو PowerPoint أو نصًا.')),
      ));
    } finally {
      if (mounted) setState(() => uploading = false);
    }
  }

  Future<void> remove() async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(tr('Remove this classwork?', 'حذف أعمال الصف هذه؟')),
        content: Text(tr('Its post and the files parents sent are removed too.', 'يُحذف منشورها والملفات التي أرسلها أولياء الأمور.')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialog, false), child: Text(tr('Cancel', 'إلغاء'))),
          FilledButton(onPressed: () => Navigator.pop(dialog, true), child: Text(tr('Remove', 'حذف'))),
        ],
      ),
    );
    if (sure == true) await widget.removeWork(textValue(widget.item, 'id'));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final item = widget.item;
    final exam = item['type'] == 'exam';
    final accent = exam ? const Color(0xFFB3261E) : const Color(0xFFB26A00);
    final submissions = schoolRows(item['submissions'])
        .where((row) => !widget.parent || row['studentId'] == widget.childId)
        .toList();
    final mine = submissions.firstOrNull;
    return Material(
      color: colors.surfaceContainer,
      borderRadius: BorderRadius.circular(22),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 8, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: accent.withValues(alpha: .14), borderRadius: BorderRadius.circular(99)),
                  child: Text(exam ? tr('Exam', 'اختبار') : tr('Homework', 'واجب'),
                      style: TextStyle(color: accent, fontWeight: FontWeight.w700, fontSize: 12)),
                ),
                const SizedBox(width: 8),
                Icon(Icons.event, size: 16, color: colors.onSurfaceVariant),
                const SizedBox(width: 4),
                Expanded(child: Text('${tr('Due', 'التسليم')} ${textValue(item, 'dueDate')}', style: theme.textTheme.labelMedium)),
                if (!widget.parent)
                  IconButton(tooltip: tr('Remove classwork', 'حذف أعمال الصف'), icon: const Icon(Icons.delete_outline), onPressed: remove),
              ],
            ),
            const SizedBox(height: 8),
            Text(textValue(item, 'title'), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            if (textValue(item, 'details').isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(textValue(item, 'details'), style: theme.textTheme.bodyMedium),
            ],
            if (textValue(item, 'byName').isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(textValue(item, 'byName'), style: theme.textTheme.bodySmall?.copyWith(color: colors.onSurfaceVariant)),
            ],
            const SizedBox(height: 10),
            if (widget.parent) ...[
              if (mine != null)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.check_circle, color: Color(0xFF2E7D32)),
                  title: Text(tr('Sent: ', 'أُرسل: ') + textValue(mine, 'name')),
                  subtitle: Text(size(mine['size'] is int ? mine['size'] as int : 0)),
                  onTap: () => widget.openSubmission(mine),
                ),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: FilledButton.tonalIcon(
                  onPressed: uploading ? null : upload,
                  icon: uploading
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.upload_file),
                  label: Text(mine == null ? tr('Upload file', 'رفع ملف') : tr('Replace file', 'استبدال الملف')),
                ),
              ),
            ] else ...[
              Text(
                submissions.isEmpty
                    ? tr('No files from parents yet', 'لا توجد ملفات من أولياء الأمور بعد')
                    : tr('${submissions.length} files from parents', '${submissions.length} ملفات من أولياء الأمور'),
                style: theme.textTheme.labelLarge,
              ),
              for (final row in submissions)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.description_outlined),
                  title: Text(localizedValue(row, 'studentName', widget.arabic)),
                  subtitle: Text('${textValue(row, 'name')} · ${size(row['size'] is int ? row['size'] as int : 0)}'),
                  trailing: const Icon(Icons.download_outlined),
                  onTap: () => widget.openSubmission(row),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Parents who joined with the school code add their child with the invitation code.
class LinkChildCard extends StatefulWidget {
  const LinkChildCard({super.key, required this.arabic, required this.link});

  final bool arabic;
  final Future<bool> Function(String code) link;

  @override
  State<LinkChildCard> createState() => _LinkChildCardState();
}

class _LinkChildCardState extends State<LinkChildCard> {
  final code = TextEditingController();
  bool saving = false;

  String tr(String en, String ar) => widget.arabic ? ar : en;

  @override
  void dispose() {
    code.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (saving || code.text.trim().isEmpty) return;
    setState(() => saving = true);
    final ok = await widget.link(code.text);
    if (!mounted) return;
    setState(() => saving = false);
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(tr('Check the invitation code from the school.', 'تحقق من رمز الدعوة من المدرسة.')),
      ));
    }
  }

  @override
  Widget build(BuildContext context) => Material(
    color: Theme.of(context).colorScheme.surfaceContainer,
    borderRadius: BorderRadius.circular(24),
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Icon(Icons.family_restroom, color: Theme.of(context).colorScheme.primary, size: 32),
          const SizedBox(height: 10),
          Text(tr('Add your child', 'أضف طفلك'), style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 6),
          Text(tr('Enter the invitation code the school gave you to see lessons, homework and attendance.',
              'أدخل رمز الدعوة من المدرسة لرؤية الحصص والواجبات والحضور.')),
          const SizedBox(height: 14),
          TextField(
            controller: code,
            enabled: !saving,
            textCapitalization: TextCapitalization.characters,
            decoration: InputDecoration(labelText: tr('Invitation code', 'رمز الدعوة'), border: const OutlineInputBorder()),
            onSubmitted: (_) => save(),
          ),
          const SizedBox(height: 12),
          FilledButton(onPressed: saving ? null : save, child: Text(saving ? tr('Adding…', 'جارٍ الإضافة…') : tr('Add child', 'إضافة الطفل'))),
        ],
      ),
    ),
  );
}
