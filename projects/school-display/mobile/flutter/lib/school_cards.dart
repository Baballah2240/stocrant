import 'package:material_ui/material_ui.dart';

import 'parent_details.dart';
import 'school_api.dart';

enum SchoolCard { timetable, attendance, work, announcements }

class SchoolCards {
  SchoolCards(this.data, this.edition, this.arabic, this.selection);

  final SchoolData data;
  final Edition edition;
  final bool arabic;
  final SchoolRow? selection;

  bool get parent => edition == Edition.parent;
  String tr(String en, String ar) => arabic ? ar : en;
  Object? get classId => parent ? (selection?['classId']) : (selection?['id']);

  String nameOf(SchoolRow row) => localizedValue(row, 'name', arabic);

  String className(Object? id) {
    for (final row in data.rows('classes')) {
      if (row['id'] == id) return nameOf(row);
    }
    return '';
  }

  String studentName(Object? id) {
    for (final row in data.rows('students')) {
      if (row['id'] == id) return nameOf(row);
    }
    return '';
  }

  String title(SchoolCard card) => switch (card) {
    SchoolCard.timetable => tr('Timetable', 'الجدول الدراسي'),
    SchoolCard.attendance => tr('Attendance', 'الحضور'),
    SchoolCard.work =>
      parent
          ? tr('Homework and exams', 'الواجبات والاختبارات')
          : tr('Classwork and exams', 'أعمال الصف والاختبارات'),
    SchoolCard.announcements => tr(
      'Announcements and messages',
      'الإعلانات والرسائل',
    ),
  };

  IconData icon(SchoolCard card) => switch (card) {
    SchoolCard.timetable => Icons.calendar_today_outlined,
    SchoolCard.attendance => Icons.fact_check_outlined,
    SchoolCard.work => Icons.assignment_outlined,
    SchoolCard.announcements => Icons.campaign_outlined,
  };

  List<DetailRow> details(SchoolCard card) => switch (card) {
    SchoolCard.timetable => timetable(),
    SchoolCard.attendance => attendance(),
    SchoolCard.work => classwork(),
    SchoolCard.announcements => announcements(),
  };

  List<DetailRow> timetable() {
    if (parent && classId == null) return const [];
    return [
      for (final day in data.rows('days'))
        for (final row in schoolRows(day['rows']))
          if (parent
              ? row['classId'] == classId
              : (row['mine'] == true || row['coveredBy'] == true))
            (
              title: localizedValue(row, 'subject', arabic).isEmpty
                  ? tr('School activity', 'نشاط مدرسي')
                  : localizedValue(row, 'subject', arabic),
              description: [
                textValue(day, 'date'),
                '${row['start']}–${row['end']}',
                className(row['classId']),
                textValue(row, 'room'),
                if (row['coveredBy'] == true)
                  tr('Covered by a substitute', 'يتولى الحصة معلم بديل'),
              ].where((item) => item.isNotEmpty).join(' · '),
            ),
    ];
  }

  List<DetailRow> attendance() {
    if (selection == null) return const [];
    final records =
        data
            .rows('attendance')
            .where(
              (row) => parent
                  ? row['studentId'] == (selection?['id'])
                  : row['classId'] == classId,
            )
            .toList()
          ..sort(
            (a, b) => textValue(b, 'date').compareTo(textValue(a, 'date')),
          );
    return [
      for (final row in records)
        (
          title: parent
              ? textValue(row, 'date')
              : studentName(row['studentId']),
          description: [
            if (!parent) textValue(row, 'date'),
            switch (row['status']) {
              'present' => tr('Present', 'حاضر'),
              'absent' => tr('Absent', 'غائب'),
              'late' => tr('Late', 'متأخر'),
              'excused' => tr('Excused', 'غياب بعذر'),
              _ => textValue(row, 'status'),
            },
          ].join(' · '),
        ),
    ];
  }

  List<DetailRow> classwork() => [
    for (final row in data.rows('work'))
      if (classId != null && row['classId'] == classId)
        (
          title: textValue(row, 'title'),
          description: [
            row['type'] == 'exam'
                ? tr('Exam', 'اختبار')
                : tr('Homework', 'واجب'),
            textValue(row, 'dueDate'),
            textValue(row, 'details'),
          ].where((item) => item.isNotEmpty).join('\n'),
        ),
  ];

  List<DetailRow> announcements() {
    final schoolAnnouncement = localizedValue(
      data.school,
      'announcement',
      arabic,
    );
    return [
      if (schoolAnnouncement.isNotEmpty)
        (
          title: tr('School announcement', 'إعلان المدرسة'),
          description: schoolAnnouncement,
        ),
      for (final row in data.rows('announcements'))
        (
          title: localizedValue(row, 'text', arabic),
          description: textValue(row, 'expiresAt').split('T').first,
        ),
      for (final row in data.rows('messages').reversed)
        if (row['direction'] != 'up')
          (
            title: textValue(row, 'subject').isEmpty
                ? textValue(row, 'fromName')
                : textValue(row, 'subject'),
            description: textValue(row, 'text'),
          ),
    ];
  }
}
