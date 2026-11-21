import 'package:material_ui/material_ui.dart';

typedef DetailRow = ({String title, String description});

List<DetailRow> parentDetails(int card, bool ar) => switch (card) {
  -1 || 0 =>
    ar
        ? const [
            (title: 'الرياضيات · ٠٩:٠٠', description: '٩:٠٠–٩:٤٥ · الصف ٥ أ'),
            (
              title: 'العلوم · ١٠:١٥',
              description: '١٠:١٥–١١:٠٠ · مختبر العلوم',
            ),
          ]
        : const [
            (
              title: 'Mathematics · 09:00',
              description: '09:00–09:45 · Grade 5A',
            ),
            (
              title: 'Science · 10:15',
              description: '10:15–11:00 · Science lab',
            ),
          ],
  1 =>
    ar
        ? const [
            (title: 'اليوم', description: 'حاضر'),
            (title: 'أمس', description: 'حاضر'),
          ]
        : const [
            (title: 'Today', description: 'Present'),
            (title: 'Yesterday', description: 'Present'),
          ],
  2 =>
    ar
        ? const [
            (
              title: 'ورقة عمل الكسور',
              description:
                  'الرياضيات · موعد التسليم الخميس\nأكمل الأسئلة من ١ إلى ٥.',
            ),
          ]
        : const [
            (
              title: 'Fractions worksheet',
              description:
                  'Mathematics · Due Thursday\nComplete questions 1–5.',
            ),
          ],
  _ =>
    ar
        ? const [
            (
              title: 'اجتماع أولياء الأمور',
              description: 'الأربعاء · ٤:٠٠ مساءً\nقاعة المدرسة الرئيسية',
            ),
          ]
        : const [
            (
              title: 'Parent meeting',
              description: 'Wednesday · 4:00 PM\nMain school hall',
            ),
          ],
};

List<DetailRow> teacherDetails(int card, bool ar) {
  return switch (card) {
    1 => [
      (
        title: ar ? 'الصف ٥ أ' : 'Grade 5A',
        description: ar
            ? '٢٤ طالبًا · ٢٣ حاضرًا · ١ غائب'
            : '24 students · 23 present · 1 absent',
      ),
    ],
    3 => [
      (
        title: ar ? 'اجتماع المعلمين' : 'Staff meeting',
        description: ar ? 'الأربعاء · غرفة المعلمين' : 'Wednesday · Staff room',
      ),
    ],
    _ => parentDetails(card, ar),
  };
}

Future<void> openCardDetails(
  BuildContext context, {
  required List<DetailRow> rows,
  required String title,
  required IconData icon,
  required bool arabic,
  Widget? media,
}) {
  final duration = MediaQuery.disableAnimationsOf(context)
      ? Duration.zero
      : const Duration(milliseconds: 310);
  return Navigator.of(context).push<void>(
    PageRouteBuilder<void>(
      transitionDuration: duration,
      reverseTransitionDuration: duration,
      pageBuilder: (context, animation, secondary) => Scaffold(
        appBar: AppBar(
          automaticallyImplyLeading: false,
          title: BackPill(label: arabic ? 'رجوع' : 'Back'),
        ),
        body: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 660),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    DecoratedBox(
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.surfaceContainer,
                        borderRadius: BorderRadius.circular(26),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(
                              icon,
                              size: 30,
                              color: Theme.of(context).colorScheme.primary,
                            ),
                            const SizedBox(height: 12),
                            Text(
                              title,
                              style: Theme.of(context).textTheme.headlineMedium,
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    if (media != null) ...[
                      ClipRRect(
                        borderRadius: BorderRadius.circular(20),
                        child: media,
                      ),
                      const SizedBox(height: 14),
                    ],
                    if (rows.isEmpty)
                      Text(arabic ? 'لا توجد بيانات بعد.' : 'No records yet.'),
                    for (final row in rows)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 14),
                        child: ListTile(
                          tileColor: Theme.of(context).colorScheme.surface,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                          title: Text(row.title),
                          subtitle: Text(row.description),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 18,
                            vertical: 8,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
      transitionsBuilder: (context, animation, secondary, child) {
        final progress = animation.drive(
          CurveTween(curve: Curves.easeOutCubic),
        );
        return FadeTransition(
          opacity: progress,
          child: SlideTransition(
            position: progress.drive(
              Tween(begin: const Offset(0, .05), end: Offset.zero),
            ),
            child: child,
          ),
        );
      },
    ),
  );
}

class BackPill extends StatelessWidget {
  const BackPill({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => FilledButton.tonalIcon(
    onPressed: () => Navigator.of(context).maybePop(),
    icon: const BackButtonIcon(),
    label: Text(label),
  );
}
