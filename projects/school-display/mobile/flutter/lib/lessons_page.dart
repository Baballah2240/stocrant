import 'package:material_ui/material_ui.dart';

import 'bento.dart';
import 'classwork_page.dart';
import 'parent_details.dart';
import 'school_api.dart';
import 'school_cards.dart';

/// The Lessons tab: what is on now, what is next, and the week ahead.
class LessonsPage extends StatelessWidget {
  const LessonsPage({
    super.key,
    required this.data,
    required this.edition,
    required this.arabic,
    required this.selection,
    required this.onSelect,
    required this.refresh,
    required this.linkChild,
    this.now,
  });

  final SchoolData data;
  final Edition edition;
  final bool arabic;
  final Object? selection;
  final ValueChanged<Object> onSelect;
  final Future<void> Function() refresh;
  final Future<bool> Function(String code) linkChild;
  final DateTime? now;

  bool get parent => edition == Edition.parent;
  String tr(String en, String ar) => arabic ? ar : en;

  int minutes(Object? time) {
    final parts = (time is String ? time : '').split(':');
    return parts.length < 2 ? 0 : (int.tryParse(parts[0]) ?? 0) * 60 + (int.tryParse(parts[1]) ?? 0);
  }

  @override
  Widget build(BuildContext context) {
    final options = parent
        ? [for (final child in data.rows('children')) (id: child['id'] as Object, label: nameOf(child, arabic))]
        : [
            for (final group in data.rows('classes'))
              if (data.assignedClasses.contains(group['id'])) (id: group['id'] as Object, label: nameOf(group, arabic)),
          ];
    final chosen = options.where((option) => option.id == selection).firstOrNull ?? options.firstOrNull;
    final selected = parent
        ? data.rows('children').where((row) => row['id'] == chosen?.id).firstOrNull
        : data.rows('classes').where((row) => row['id'] == chosen?.id).firstOrNull;
    final cards = SchoolCards(data, edition, arabic, selected);
    final childClass = parent ? (selected?['classId']) : null;
    bool shown(SchoolRow row) => parent ? row['classId'] == childClass : (row['mine'] == true || row['coveredBy'] == true);

    final clock = now ?? DateTime.now();
    final today = data.today;
    final nowMinutes = clock.hour * 60 + clock.minute;
    final days = [
      for (final day in data.rows('days'))
        (date: textValue(day, 'date'), holiday: day['holiday'] == true ? true : null, rows: schoolRows(day['rows']).where(shown).toList()),
    ];
    SchoolRow? current, upcoming;
    String upcomingDate = '';
    for (final day in days) {
      for (final row in day.rows) {
        if (row['type'] == 'break') continue;
        final start = minutes(row['start']), end = minutes(row['end']);
        if (day.date == today && start <= nowMinutes && nowMinutes < end) current ??= row;
        if (upcoming == null && (day.date != today || start > nowMinutes)) {
          upcoming = row;
          upcomingDate = day.date;
        }
      }
    }
    final inset = MediaQuery.sizeOf(context).width < 360 ? 12.0 : 20.0;
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    return RefreshIndicator(
      onRefresh: refresh,
      child: ListView(
        padding: EdgeInsets.fromLTRB(inset, 12, inset, 96),
        children: [
          Text(tr('Lessons', 'الحصص'), style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          if (parent && options.isEmpty)
            LinkChildCard(arabic: arabic, link: linkChild)
          else ...[
            ChoiceStrip(options: options, selected: chosen?.id, onSelected: onSelect, label: parent ? tr('Child', 'الطفل') : tr('Class', 'الصف')),
            if (options.length > 1) const SizedBox(height: 12),
            _HeroLesson(
              arabic: arabic,
              row: current ?? upcoming,
              live: current != null,
              date: current != null ? today : upcomingDate,
              className: cards.className((current ?? upcoming)?['classId']),
              minutesLeft: current == null ? null : minutes(current['end']) - nowMinutes,
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                for (final card in [SchoolCard.attendance, SchoolCard.announcements]) ...[
                  if (card == SchoolCard.announcements) const SizedBox(width: 12),
                  Expanded(
                    child: BentoCard(
                      tile: (title: cards.title(card), detail: '', icon: cards.icon(card)),
                      onTap: () => openCardDetails(context, title: cards.title(card), icon: cards.icon(card), arabic: arabic, rows: cards.details(card)),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 18),
            for (final day in days)
              if (day.rows.isNotEmpty || day.holiday != null) ...[
                Padding(
                  padding: const EdgeInsetsDirectional.fromSTEB(4, 8, 4, 8),
                  child: Text(
                    day.date == today ? '${tr('Today', 'اليوم')} · ${day.date}' : day.date,
                    style: theme.textTheme.titleSmall?.copyWith(color: colors.onSurfaceVariant, fontWeight: FontWeight.w700),
                  ),
                ),
                Material(
                  color: colors.surfaceContainer,
                  borderRadius: BorderRadius.circular(20),
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    children: [
                      if (day.holiday != null)
                        ListTile(leading: const Icon(Icons.beach_access_outlined), title: Text(tr('School holiday', 'عطلة مدرسية'))),
                      for (final row in day.rows)
                        _LessonRow(
                          row: row,
                          arabic: arabic,
                          className: parent ? '' : cards.className(row['classId']),
                          live: identical(row, current),
                        ),
                    ],
                  ),
                ),
              ],
          ],
        ],
      ),
    );
  }
}

class _HeroLesson extends StatelessWidget {
  const _HeroLesson({required this.arabic, required this.row, required this.live, required this.date, required this.className, this.minutesLeft});

  final bool arabic;
  final SchoolRow? row;
  final bool live;
  final String date;
  final String className;
  final int? minutesLeft;

  String tr(String en, String ar) => arabic ? ar : en;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final lesson = row;
    return FadeUp(
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(28),
          gradient: LinearGradient(
            begin: AlignmentDirectional.topStart,
            end: AlignmentDirectional.bottomEnd,
            colors: [colors.primary, Color.lerp(colors.primary, colors.tertiary, .55)!],
          ),
        ),
        // Merge keeps the theme's Arabic fallback font.
        child: DefaultTextStyle.merge(
          style: TextStyle(color: colors.onPrimary),
          child: lesson == null
              ? Text(tr('No upcoming lessons in the published timetable.', 'لا توجد حصص قادمة في الجدول المنشور.'), style: theme.textTheme.titleMedium?.copyWith(color: colors.onPrimary))
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(color: colors.onPrimary.withValues(alpha: .18), borderRadius: BorderRadius.circular(99)),
                          child: Text(live ? tr('NOW', 'الآن') : tr('NEXT', 'التالية'), style: TextStyle(color: colors.onPrimary, fontWeight: FontWeight.w800, fontSize: 12, letterSpacing: .6)),
                        ),
                        const Spacer(),
                        if (minutesLeft != null)
                          Text(tr('$minutesLeft min left', 'متبقٍ $minutesLeft د'), style: TextStyle(color: colors.onPrimary, fontWeight: FontWeight.w700)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      localizedValue(lesson, 'subject', arabic).isEmpty ? tr('School activity', 'نشاط مدرسي') : localizedValue(lesson, 'subject', arabic),
                      style: theme.textTheme.headlineMedium?.copyWith(color: colors.onPrimary, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      [
                        '${lesson['start']}–${lesson['end']}',
                        if (date.isNotEmpty) date,
                        if (className.isNotEmpty) className,
                        if (textValue(lesson, 'room').isNotEmpty) textValue(lesson, 'room'),
                        if (localizedValue(lesson, 'teacher', arabic).isNotEmpty) localizedValue(lesson, 'teacher', arabic),
                      ].join(' · '),
                      style: TextStyle(color: colors.onPrimary.withValues(alpha: .92)),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

class _LessonRow extends StatelessWidget {
  const _LessonRow({required this.row, required this.arabic, required this.className, required this.live});

  final SchoolRow row;
  final bool arabic;
  final String className;
  final bool live;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final isBreak = row['type'] == 'break';
    final subject = localizedValue(row, 'subject', arabic);
    return Container(
      color: live ? colors.primary.withValues(alpha: .10) : null,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          SizedBox(
            width: 62,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(textValue(row, 'start'), style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700, fontFeatures: const [FontFeature.tabularFigures()])),
                Text(textValue(row, 'end'), style: theme.textTheme.bodySmall?.copyWith(color: colors.onSurfaceVariant)),
              ],
            ),
          ),
          Container(width: 3, height: 34, margin: const EdgeInsetsDirectional.only(end: 12), decoration: BoxDecoration(color: isBreak ? colors.tertiary : colors.primary, borderRadius: BorderRadius.circular(2))),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(subject.isEmpty ? (arabic ? 'نشاط' : 'Activity') : subject, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                Text(
                  [
                    if (className.isNotEmpty) className,
                    if (textValue(row, 'room').isNotEmpty) textValue(row, 'room'),
                    if (localizedValue(row, 'teacher', arabic).isNotEmpty) localizedValue(row, 'teacher', arabic),
                  ].join(' · '),
                  style: theme.textTheme.bodySmall?.copyWith(color: colors.onSurfaceVariant),
                ),
              ],
            ),
          ),
          if (live) Icon(Icons.play_circle_fill, color: colors.primary),
        ],
      ),
    );
  }
}
