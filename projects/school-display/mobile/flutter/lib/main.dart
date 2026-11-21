import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:material_ui/material_ui.dart';

import 'app_settings.dart';
import 'bento.dart';
import 'layout_standards.dart';
import 'school_api.dart';
import 'school_home.dart';

export 'bento.dart' show ShimmerBlock;
import 'parent_details.dart';
import 'platform_services.dart';

void main() => runApp(const Faslii());

const brown = Color(0xff805338);
const lightBrown = Color(0xffc99574);

ThemeData fasliiTheme(Brightness brightness, Locale locale) {
  final dark = brightness == Brightness.dark;
  final base = ThemeData(
    brightness: brightness,
    fontFamily: kIsWeb && locale.languageCode == 'ar'
        ? 'Noto Sans Arabic'
        : null,
    fontFamilyFallback: const ['Noto Sans Arabic'],
    colorScheme: ColorScheme.fromSeed(seedColor: brown, brightness: brightness)
        .copyWith(
          primary: dark ? lightBrown : brown,
          surface: dark ? const Color(0xff151210) : Colors.white,
          onSurface: dark ? Colors.white : Colors.black,
          surfaceContainer: dark
              ? const Color(0xff27211d)
              : const Color(0xfff1ebe6),
        ),
    filledButtonTheme: const FilledButtonThemeData(
      style: SchoolLayout.actionStyle,
    ),
    outlinedButtonTheme: const OutlinedButtonThemeData(
      style: SchoolLayout.actionStyle,
    ),
    textButtonTheme: const TextButtonThemeData(style: SchoolLayout.actionStyle),
    inputDecorationTheme: const InputDecorationThemeData(
      labelStyle: TextStyle(fontSize: SchoolLayout.labelSize),
      contentPadding: EdgeInsets.symmetric(
        horizontal: SchoolLayout.largeSpace,
        vertical: SchoolLayout.mediumSpace,
      ),
    ),
    scaffoldBackgroundColor: dark
        ? const Color(0xff151210)
        : const Color(0xfffaf8f6),
  );
  final foreground = dark ? Colors.white : Colors.black;
  return base.copyWith(
    textTheme: base.textTheme.apply(
      bodyColor: foreground,
      displayColor: foreground,
    ),
  );
}

class FasliiScrollBehavior extends MaterialScrollBehavior {
  const FasliiScrollBehavior();

  @override
  Widget buildScrollbar(
    BuildContext context,
    Widget child,
    ScrollableDetails details,
  ) {
    if (details.direction == AxisDirection.left ||
        details.direction == AxisDirection.right)
      return child;
    return Scrollbar(
      controller: details.controller,
      radius: const Radius.circular(8),
      thickness: 5,
      child: child,
    );
  }
}

class Faslii extends StatefulWidget {
  const Faslii({super.key, this.edition});

  final Edition? edition;

  @override
  State<Faslii> createState() => _FasliiState();
}

class _FasliiState extends State<Faslii> with WidgetsBindingObserver {
  final preferences = AppPreferences();
  final biometrics = DeviceBiometrics();
  ThemeMode mode = ThemeMode.system;
  Locale locale = const Locale('ar');
  bool languageChanged = false;
  late bool loadingLock = biometrics.supportedPlatform;
  bool lockEnabled = false;
  bool locked = false;
  bool authenticating = false;
  bool unlockFailed = false;
  bool loadFailed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    loadPreferences();
  }

  Future<void> loadPreferences() async {
    try {
      final language = await preferences.language();
      if (mounted && !languageChanged && language == 'en') {
        setState(() => locale = const Locale('en'));
      }
    } catch (_) {
      // Arabic remains available if the preference store cannot be read.
    }
    if (!biometrics.supportedPlatform) return;
    try {
      final enabled = await preferences.lockEnabled();
      if (mounted) {
        setState(() {
          lockEnabled = enabled;
          locked = enabled;
          loadingLock = false;
          loadFailed = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => loadFailed = true);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (lockEnabled &&
        !locked &&
        (state == AppLifecycleState.hidden ||
            state == AppLifecycleState.paused)) {
      FocusManager.instance.primaryFocus?.unfocus();
      setState(() => locked = true);
    }
  }

  void changeLanguage(bool arabic) {
    final code = arabic ? 'ar' : 'en';
    languageChanged = true;
    setState(() => locale = Locale(code));
    preferences.setLanguage(code).catchError((Object _) {});
  }

  Future<bool> changeLock(bool enabled, String reason) async {
    if (!await biometrics.confirm(reason) || !mounted) return false;
    await preferences.setLock(enabled);
    if (mounted) {
      setState(() {
        lockEnabled = enabled;
        locked =
            enabled &&
            WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed;
      });
    }
    return true;
  }

  Future<void> unlock() async {
    if (authenticating) return;
    setState(() {
      authenticating = true;
      unlockFailed = false;
    });
    var verified = false;
    try {
      verified = await biometrics.confirm(
        locale.languageCode == 'ar' ? 'افتح تطبيق فصلي' : 'Unlock Faslii',
      );
    } catch (_) {
      // The lock stays in place if the system prompt fails.
    }
    if (mounted) {
      setState(() {
        locked =
            !verified ||
            WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed;
        authenticating = false;
        unlockFailed = locked;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    String tr(String en, String ar) => locale.languageCode == 'ar' ? ar : en;
    Widget settings(bool arabic) => AppSettings(
      arabic: arabic,
      mode: mode,
      onMode: (value) => setState(() => mode = value),
      biometrics: biometrics,
      lockEnabled: () => lockEnabled,
      changeLock: changeLock,
    );
    return MaterialApp(
      title: 'Faslii',
      scrollBehavior: const FasliiScrollBehavior(),
      debugShowCheckedModeBanner: false,
      theme: fasliiTheme(Brightness.light, locale),
      darkTheme: fasliiTheme(Brightness.dark, locale),
      themeMode: mode,
      locale: locale,
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      builder: (context, child) => Stack(
        fit: StackFit.expand,
        children: [
          Offstage(
            offstage: loadingLock || locked,
            child: ExcludeFocus(
              excluding: loadingLock || locked,
              child: child!,
            ),
          ),
          if (loadingLock)
            Scaffold(
              body: Center(
                child: loadFailed
                    ? TextButton(
                        onPressed: loadPreferences,
                        child: Text(
                          tr(
                            'Retry app lock check',
                            'أعد التحقق من قفل التطبيق',
                          ),
                        ),
                      )
                    : const CircularProgressIndicator(),
              ),
            )
          else if (locked)
            LockScreen(
              tr: tr,
              onUnlock: unlock,
              busy: authenticating,
              failed: unlockFailed,
            ),
        ],
      ),
      home: widget.edition != null
          ? SchoolHome(
              edition: widget.edition!,
              onLanguage: changeLanguage,
              settings: settings,
              mode: mode,
              onMode: (value) => setState(() => mode = value),
            )
          : Dashboard(onLanguage: changeLanguage, settings: settings),
    );
  }
}

const teacherTiles = <TileData>[
  (
    title: 'Today’s timetable',
    detail: 'Mathematics · 09:00\nScience · 10:15',
    icon: Icons.calendar_today_outlined,
  ),
  (
    title: 'Attendance',
    detail: 'Grade 5A · 24 students',
    icon: Icons.fact_check_outlined,
  ),
  (
    title: 'Classwork',
    detail: 'Fractions worksheet · Due Thursday',
    icon: Icons.assignment_outlined,
  ),
  (
    title: 'Announcements',
    detail: 'Staff meeting · Wednesday',
    icon: Icons.campaign_outlined,
  ),
];

const parentTiles = <TileData>[
  (
    title: 'Today’s timetable',
    detail: 'Mathematics · 09:00\nScience · 10:15',
    icon: Icons.calendar_today_outlined,
  ),
  (
    title: 'Attendance',
    detail: 'Present today',
    icon: Icons.fact_check_outlined,
  ),
  (
    title: 'Homework',
    detail: 'Fractions worksheet · Due Thursday',
    icon: Icons.assignment_outlined,
  ),
  (
    title: 'Announcements',
    detail: 'Parent meeting · Wednesday',
    icon: Icons.campaign_outlined,
  ),
];

const teacherArabic = <TileData>[
  (
    title: 'جدول اليوم',
    detail: 'الرياضيات · ٠٩:٠٠\nالعلوم · ١٠:١٥',
    icon: Icons.calendar_today_outlined,
  ),
  (
    title: 'الحضور',
    detail: 'الصف ٥ أ · ٢٤ طالبًا',
    icon: Icons.fact_check_outlined,
  ),
  (
    title: 'أعمال الصف',
    detail: 'ورقة عمل الكسور · التسليم الخميس',
    icon: Icons.assignment_outlined,
  ),
  (
    title: 'الإعلانات',
    detail: 'اجتماع المعلمين · الأربعاء',
    icon: Icons.campaign_outlined,
  ),
];

const parentArabic = <TileData>[
  (
    title: 'جدول اليوم',
    detail: 'الرياضيات · ٠٩:٠٠\nالعلوم · ١٠:١٥',
    icon: Icons.calendar_today_outlined,
  ),
  (title: 'الحضور', detail: 'حاضر اليوم', icon: Icons.fact_check_outlined),
  (
    title: 'الواجبات',
    detail: 'ورقة عمل الكسور · التسليم الخميس',
    icon: Icons.assignment_outlined,
  ),
  (
    title: 'الإعلانات',
    detail: 'اجتماع أولياء الأمور · الأربعاء',
    icon: Icons.campaign_outlined,
  ),
];

class Dashboard extends StatefulWidget {
  const Dashboard({
    super.key,
    required this.onLanguage,
    required this.settings,
  });

  final ValueChanged<bool> onLanguage;
  final Widget Function(bool arabic) settings;

  @override
  State<Dashboard> createState() => _DashboardState();
}

class _DashboardState extends State<Dashboard> {
  bool parent = true;
  bool loading = false;
  int roleRequest = 0;

  Future<void> changeRole(bool value) async {
    if (value == parent && !loading) return;
    setState(() {
      parent = value;
      loading = true;
    });
    final request = ++roleRequest;
    await Future<void>.delayed(const Duration(milliseconds: 450));
    if (mounted && request == roleRequest) {
      setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final arabic = Localizations.localeOf(context).languageCode == 'ar';
    String tr(String en, String ar) => arabic ? ar : en;
    final tiles = parent
        ? (arabic ? parentArabic : parentTiles)
        : (arabic ? teacherArabic : teacherTiles);
    final featured = (
      title: parent
          ? tr('Grade 5A · Today', 'الصف ٥ أ · اليوم')
          : tr('Your school day', 'يومك الدراسي'),
      detail: tr(
        'Up next · Mathematics at 09:00',
        'التالي · الرياضيات الساعة ٠٩:٠٠',
      ),
      icon: Icons.schedule_outlined,
    );
    void openCard(int index, TileData tile) => openCardDetails(
      context,
      title: tile.title,
      icon: tile.icon,
      arabic: arabic,
      rows: parent
          ? parentDetails(index, arabic)
          : teacherDetails(index, arabic),
    );
    return Scaffold(
      drawer: FasliiMenu(
        tr: tr,
        arabic: arabic,
        onLanguage: widget.onLanguage,
        openSettings: () => Navigator.of(context).push<void>(
          MaterialPageRoute(builder: (context) => widget.settings(arabic)),
        ),
      ),
      drawerEnableOpenDragGesture: true,
      appBar: AppBar(title: Text(tr('Faslii', 'فصلي'))),
      body: SafeArea(
        top: false,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final side = constraints.maxWidth < 380 ? 12.0 : 20.0;
            final width = (constraints.maxWidth - 2 * side)
                .clamp(0.0, 900.0)
                .toDouble();
            final largeText = MediaQuery.textScalerOf(context).scale(16) > 21;
            final columns = width >= 390 && !largeText ? 2 : 1;
            final padding = (constraints.maxWidth - width) / 2;
            return CustomScrollView(
              cacheExtent: 0,
              slivers: [
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(padding, 12, padding, 12),
                  sliver: SliverToBoxAdapter(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tr(
                            'Layout preview · Sample data',
                            'معاينة التصميم · بيانات تجريبية',
                          ),
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            ChoiceChip(
                              label: Text(tr('Teacher', 'المعلم')),
                              selected: !parent,
                              onSelected: (_) => changeRole(false),
                            ),
                            ChoiceChip(
                              label: Text(tr('Parent', 'ولي الأمر')),
                              selected: parent,
                              onSelected: (_) => changeRole(true),
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),
                        if (loading)
                          const ShimmerBlock(height: 150)
                        else
                          BentoCard(
                            key: ValueKey(parent),
                            featured: true,
                            tile: featured,
                            onTap: () => openCard(-1, featured),
                          ),
                      ],
                    ),
                  ),
                ),
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(padding, 0, padding, 24),
                  sliver: SliverList.builder(
                    itemCount: (tiles.length / columns).ceil(),
                    itemBuilder: (context, row) {
                      final start = row * columns;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            for (
                              var column = 0;
                              column < columns;
                              column++
                            ) ...[
                              if (column > 0) const SizedBox(width: 12),
                              Expanded(
                                child: loading
                                    ? const ShimmerBlock(height: 135)
                                    : BentoCard(
                                        key: ValueKey(tiles[start + column]),
                                        tile: tiles[start + column],
                                        onTap: () => openCard(
                                          start + column,
                                          tiles[start + column],
                                        ),
                                      ),
                              ),
                            ],
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
