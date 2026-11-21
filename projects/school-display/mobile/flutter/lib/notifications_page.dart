import 'package:material_ui/material_ui.dart';

import 'school_api.dart';

enum NoticeKind { school, post, classwork, announcement, message }

typedef NoticeItem = ({
  String id,
  NoticeKind kind,
  String title,
  String text,
  DateTime? at,
});

/// Everything the school sent this person, newest first.
List<NoticeItem> collectNotices(SchoolData data, bool arabic) {
  final items = <NoticeItem>[
    for (final row in data.rows('items'))
      (
        id: 'n:${textValue(row, 'id')}',
        kind: switch (row['type']) {
          'posts' => NoticeKind.post,
          'classwork' => NoticeKind.classwork,
          _ => NoticeKind.school,
        },
        title: textValue(row, 'title'),
        text: textValue(row, 'text'),
        at: DateTime.tryParse(textValue(row, 'editedAt').isEmpty
            ? textValue(row, 'at')
            : textValue(row, 'editedAt')),
      ),
    for (final row in data.rows('announcements'))
      (
        id: 'a:${textValue(row, 'id')}',
        kind: NoticeKind.announcement,
        title: arabic ? 'إعلان الصف' : 'Class announcement',
        text: localizedValue(row, 'text', arabic),
        at: DateTime.tryParse(textValue(row, 'createdAt')),
      ),
    for (final row in data.rows('messages'))
      if (row['direction'] != 'up')
        (
          id: 'm:${textValue(row, 'id')}',
          kind: NoticeKind.message,
          title: textValue(row, 'subject').isNotEmpty
              ? textValue(row, 'subject')
              : textValue(row, 'fromName').isNotEmpty
              ? textValue(row, 'fromName')
              : (arabic ? 'رسالة من المدرسة' : 'Message from the school'),
          text: textValue(row, 'text'),
          at: DateTime.tryParse(textValue(row, 'at')),
        ),
  ];
  items.sort((a, b) => (b.at ?? DateTime(2000)).compareTo(a.at ?? DateTime(2000)));
  return items;
}

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({
    super.key,
    required this.items,
    required this.seen,
    required this.onSeen,
  });

  final List<NoticeItem> items;
  final Set<String> seen;
  final ValueChanged<Iterable<String>> onSeen;

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  late final unread = {
    for (final item in widget.items)
      if (!widget.seen.contains(item.id)) item.id,
  };

  bool get arabic => Localizations.localeOf(context).languageCode == 'ar';
  String tr(String en, String ar) => arabic ? ar : en;

  @override
  void initState() {
    super.initState();
    // Opening the list counts as seeing it; the dots stay until the page closes.
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => widget.onSeen(widget.items.map((item) => item.id)),
    );
  }

  String group(DateTime? at) {
    if (at == null) return tr('Earlier', 'سابقًا');
    final now = DateTime.now();
    final day = DateTime(at.toLocal().year, at.toLocal().month, at.toLocal().day);
    final today = DateTime(now.year, now.month, now.day);
    final diff = today.difference(day).inDays;
    if (diff <= 0) return tr('Today', 'اليوم');
    if (diff == 1) return tr('Yesterday', 'أمس');
    if (diff < 7) return tr('This week', 'هذا الأسبوع');
    return tr('Earlier', 'سابقًا');
  }

  String ago(DateTime? at) {
    if (at == null) return '';
    final minutes = DateTime.now().difference(at).inMinutes;
    if (minutes < 1) return tr('Just now', 'الآن');
    if (minutes < 60) return tr('$minutes min ago', 'قبل $minutes د');
    final hours = minutes ~/ 60;
    if (hours < 24) return tr('$hours h ago', 'قبل $hours س');
    final local = at.toLocal();
    final time =
        '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
    return '${local.year}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')} · $time';
  }

  ({IconData icon, Color color, String label}) style(NoticeKind kind) {
    final colors = Theme.of(context).colorScheme;
    return switch (kind) {
      NoticeKind.post => (
        icon: Icons.photo_library_outlined,
        color: const Color(0xFF2E7D32),
        label: tr('New post', 'منشور جديد'),
      ),
      NoticeKind.classwork => (
        icon: Icons.assignment_outlined,
        color: const Color(0xFFB26A00),
        label: tr('Classwork', 'أعمال الصف'),
      ),
      NoticeKind.announcement => (
        icon: Icons.campaign_outlined,
        color: const Color(0xFF6A3FB5),
        label: tr('Announcement', 'إعلان'),
      ),
      NoticeKind.message => (
        icon: Icons.mail_outline,
        color: const Color(0xFF1565C0),
        label: tr('Message', 'رسالة'),
      ),
      NoticeKind.school => (
        icon: Icons.notifications_active_outlined,
        color: colors.primary,
        label: tr('School notice', 'إشعار المدرسة'),
      ),
    };
  }

  Future<void> open(NoticeItem item) async {
    setState(() => unread.remove(item.id));
    final look = style(item.kind);
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheet) => SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _Badge(icon: look.icon, color: look.color, size: 44),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(look.label, style: TextStyle(color: look.color, fontWeight: FontWeight.w700)),
                      Text(ago(item.at), style: Theme.of(sheet).textTheme.bodySmall),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Text(item.title, style: Theme.of(sheet).textTheme.titleLarge),
            const SizedBox(height: 10),
            SelectableText(item.text, style: Theme.of(sheet).textTheme.bodyLarge),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final sections = <String, List<NoticeItem>>{};
    for (final item in widget.items) {
      sections.putIfAbsent(group(item.at), () => []).add(item);
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(tr('Notifications', 'الإشعارات')),
        actions: [
          if (unread.isNotEmpty)
            TextButton(
              onPressed: () => setState(unread.clear),
              child: Text(tr('Mark all read', 'تحديد الكل كمقروء')),
            ),
        ],
      ),
      body: widget.items.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _Badge(icon: Icons.notifications_none, color: colors.primary, size: 72),
                    const SizedBox(height: 18),
                    Text(tr("You're all caught up", 'لا توجد إشعارات جديدة'), style: theme.textTheme.titleLarge),
                    const SizedBox(height: 6),
                    Text(
                      tr('Notices, posts and classwork from the school appear here.',
                          'تظهر هنا إشعارات المدرسة ومنشوراتها وأعمال الصف.'),
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium?.copyWith(color: colors.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
              children: [
                for (final entry in sections.entries) ...[
                  Padding(
                    padding: const EdgeInsetsDirectional.fromSTEB(6, 18, 6, 8),
                    child: Text(
                      entry.key,
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: colors.onSurfaceVariant,
                        letterSpacing: .4,
                      ),
                    ),
                  ),
                  Material(
                    color: colors.surfaceContainer,
                    borderRadius: BorderRadius.circular(22),
                    clipBehavior: Clip.antiAlias,
                    child: Column(
                      children: [
                        for (final (index, item) in entry.value.indexed) ...[
                          if (index > 0) Divider(height: 1, indent: 72, color: colors.outlineVariant.withValues(alpha: .5)),
                          _NoticeTile(
                            item: item,
                            look: style(item.kind),
                            time: ago(item.at),
                            unread: unread.contains(item.id),
                            onTap: () => open(item),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ],
            ),
    );
  }
}

class _NoticeTile extends StatelessWidget {
  const _NoticeTile({
    required this.item,
    required this.look,
    required this.time,
    required this.unread,
    required this.onTap,
  });

  final NoticeItem item;
  final ({IconData icon, Color color, String label}) look;
  final String time;
  final bool unread;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Badge(icon: look.icon, color: look.color, size: 44),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          look.label,
                          style: theme.textTheme.labelMedium?.copyWith(color: look.color, fontWeight: FontWeight.w700),
                        ),
                      ),
                      Text(time, style: theme.textTheme.labelSmall?.copyWith(color: colors.onSurfaceVariant)),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    item.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall?.copyWith(fontWeight: unread ? FontWeight.w800 : FontWeight.w600),
                  ),
                  if (item.text.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      item.text,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.copyWith(color: colors.onSurfaceVariant),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: AnimatedOpacity(
                opacity: unread ? 1 : 0,
                duration: const Duration(milliseconds: 200),
                child: Semantics(
                  label: unread ? (Localizations.localeOf(context).languageCode == 'ar' ? 'غير مقروء' : 'Unread') : null,
                  child: Container(width: 10, height: 10, decoration: BoxDecoration(color: colors.primary, shape: BoxShape.circle)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.icon, required this.color, required this.size});

  final IconData icon;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: color.withValues(alpha: .14),
      borderRadius: BorderRadius.circular(size * .32),
    ),
    child: Icon(icon, color: color, size: size * .5),
  );
}
