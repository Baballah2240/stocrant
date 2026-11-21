import 'package:material_ui/material_ui.dart';

import 'platform_services.dart';

typedef Translate = String Function(String english, String arabic);

class AppSettings extends StatefulWidget {
  const AppSettings({
    super.key,
    required this.arabic,
    required this.mode,
    required this.onMode,
    required this.biometrics,
    required this.lockEnabled,
    required this.changeLock,
  });

  final bool arabic;
  final ThemeMode mode;
  final ValueChanged<ThemeMode> onMode;
  final DeviceBiometrics biometrics;
  final bool Function() lockEnabled;
  final Future<bool> Function(bool enabled, String reason) changeLock;

  @override
  State<AppSettings> createState() => _AppSettingsState();
}

class _AppSettingsState extends State<AppSettings> {
  bool changingLock = false;
  bool checking = false;
  String? lockMessage;
  String? updateMessage;
  late ThemeMode mode = widget.mode;

  String tr(String en, String ar) => widget.arabic ? ar : en;

  Future<void> toggleLock(bool enabled) async {
    setState(() {
      changingLock = true;
      lockMessage = null;
    });
    String? message;
    try {
      if (enabled && !await widget.biometrics.enrolled()) {
        message = tr(
          'Set up face or fingerprint unlock in your phone settings first.',
          'فعّل التعرّف على الوجه أو بصمة الإصبع في إعدادات الهاتف أولًا.',
        );
      } else if (!await widget.changeLock(
        enabled,
        tr('Confirm the Faslii app lock change', 'أكّد تغيير قفل تطبيق فصلي'),
      )) {
        message = tr(
          'App lock setting was kept.',
          'لم يتغير إعداد قفل التطبيق.',
        );
      }
    } catch (_) {
      message = tr('Could not change app lock.', 'تعذّر تغيير قفل التطبيق.');
    }
    if (mounted) {
      setState(() {
        changingLock = false;
        lockMessage = message;
      });
    }
  }

  Future<void> runUpdateCheck() async {
    setState(() {
      checking = true;
      updateMessage = null;
    });
    String message;
    try {
      message = switch (await checkForUpdate()) {
        UpdateStatus.current => tr(
          'You have the latest version.',
          'لديك أحدث إصدار.',
        ),
        UpdateStatus.available => tr(
          'A newer version is available.',
          'يتوفر إصدار أحدث.',
        ),
        UpdateStatus.unconfigured => tr(
          'Updates are unavailable for this build.',
          'التحديثات غير متاحة لهذا الإصدار.',
        ),
      };
    } catch (_) {
      message = tr(
        'Could not check for updates. Try again.',
        'تعذّر البحث عن تحديثات. حاول مرة أخرى.',
      );
    }
    if (mounted) {
      setState(() {
        checking = false;
        updateMessage = message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final native = widget.biometrics.supportedPlatform;
    return Scaffold(
      appBar: AppBar(
        leading: BackButton(),
        title: Text(tr('Settings', 'الإعدادات')),
      ),
      body: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 660),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                ListTile(
                  leading: const Icon(Icons.brightness_6_outlined),
                  title: Text(tr('Appearance', 'المظهر')),
                  subtitle: DropdownButton<ThemeMode>(
                    value: mode,
                    isExpanded: true,
                    items: [
                      DropdownMenuItem(
                        value: ThemeMode.system,
                        child: Text(tr('System', 'النظام')),
                      ),
                      DropdownMenuItem(
                        value: ThemeMode.light,
                        child: Text(tr('Light', 'فاتح')),
                      ),
                      DropdownMenuItem(
                        value: ThemeMode.dark,
                        child: Text(tr('Dark', 'داكن')),
                      ),
                    ],
                    onChanged: (value) {
                      if (value == null) return;
                      widget.onMode(value);
                      setState(() => mode = value);
                    },
                  ),
                ),
                const Divider(),
                SwitchListTile(
                  secondary: const Icon(Icons.fingerprint),
                  title: Text(tr('App lock', 'قفل التطبيق')),
                  subtitle: Text(
                    native
                        ? tr(
                            'Use your phone’s face or fingerprint unlock.',
                            'استخدم التعرّف على الوجه أو بصمة الإصبع على هاتفك.',
                          )
                        : tr(
                            'Available in the Android and iPhone apps.',
                            'متاح في تطبيقي أندرويد وآيفون.',
                          ),
                  ),
                  value: widget.lockEnabled(),
                  onChanged: native && !changingLock ? toggleLock : null,
                ),
                if (lockMessage case final message?)
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Semantics(liveRegion: true, child: Text(message)),
                  ),
                const Divider(),
                ListTile(
                  leading: const Icon(Icons.system_update_outlined),
                  title: Text(tr('Check for update', 'التحقق من وجود تحديث')),
                  onTap: checking ? null : runUpdateCheck,
                  trailing: checking
                      ? const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : null,
                ),
                if (updateMessage case final message?)
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Semantics(liveRegion: true, child: Text(message)),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class FasliiMenu extends StatelessWidget {
  const FasliiMenu({
    super.key,
    required this.tr,
    required this.arabic,
    required this.onLanguage,
    required this.openSettings,
    this.onSignOut,
  });

  final Translate tr;
  final bool arabic;
  final ValueChanged<bool> onLanguage;
  final VoidCallback openSettings;
  final VoidCallback? onSignOut;

  @override
  Widget build(BuildContext context) => Drawer(
    child: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 16, 12, 20),
            child: Text(
              tr('Faslii', 'فصلي'),
              style: Theme.of(context).textTheme.headlineSmall,
            ),
          ),
          ListTile(
            leading: const Icon(Icons.settings_outlined),
            title: Text(tr('Settings', 'الإعدادات')),
            onTap: () {
              Navigator.of(context).pop();
              openSettings();
            },
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.language),
            title: Text(tr('Language', 'اللغة')),
          ),
          for (final option in [(true, 'العربية'), (false, 'English')])
            ListTile(
              title: Text(option.$2),
              selected: arabic == option.$1,
              trailing: arabic == option.$1 ? const Icon(Icons.check) : null,
              onTap: () {
                Navigator.of(context).pop();
                onLanguage(option.$1);
              },
            ),
          if (onSignOut != null) ...[
            const Divider(),
            ListTile(
              leading: const Icon(Icons.logout),
              title: Text(tr('Sign out', 'تسجيل الخروج')),
              onTap: () {
                Navigator.of(context).pop();
                onSignOut!();
              },
            ),
          ],
        ],
      ),
    ),
  );
}

class SignInMenu extends StatelessWidget {
  const SignInMenu({
    super.key,
    required this.tr,
    required this.arabic,
    required this.mode,
    required this.onMode,
    required this.onLanguage,
  });

  final Translate tr;
  final bool arabic;
  final ThemeMode mode;
  final ValueChanged<ThemeMode> onMode;
  final ValueChanged<bool> onLanguage;

  @override
  Widget build(BuildContext context) => Drawer(
    child: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            tr('Appearance', 'المظهر'),
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 10),
          DropdownButton<ThemeMode>(
            isExpanded: true,
            value: mode,
            items: [
              DropdownMenuItem(
                value: ThemeMode.system,
                child: Text(tr('System', 'النظام')),
              ),
              DropdownMenuItem(
                value: ThemeMode.light,
                child: Text(tr('Light', 'فاتح')),
              ),
              DropdownMenuItem(
                value: ThemeMode.dark,
                child: Text(tr('Dark', 'داكن')),
              ),
            ],
            onChanged: (value) {
              if (value != null) onMode(value);
            },
          ),
          const Divider(),
          Text(
            tr('Language', 'اللغة'),
            style: Theme.of(context).textTheme.titleLarge,
          ),
          for (final option in [(true, 'العربية'), (false, 'English')])
            ListTile(
              title: Text(option.$2),
              selected: arabic == option.$1,
              trailing: arabic == option.$1 ? const Icon(Icons.check) : null,
              onTap: () {
                Navigator.of(context).pop();
                onLanguage(option.$1);
              },
            ),
        ],
      ),
    ),
  );
}

class LockScreen extends StatelessWidget {
  const LockScreen({
    super.key,
    required this.tr,
    required this.onUnlock,
    required this.busy,
    required this.failed,
  });

  final Translate tr;
  final VoidCallback onUnlock;
  final bool busy;
  final bool failed;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Icon(Icons.lock_outline, size: 42),
              const SizedBox(height: 16),
              Text(
                tr('Faslii is locked', 'تطبيق فصلي مقفل'),
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: busy ? null : onUnlock,
                icon: const Icon(Icons.fingerprint),
                label: Text(tr('Unlock', 'فتح القفل')),
              ),
              if (failed)
                Semantics(
                  liveRegion: true,
                  child: Text(
                    tr(
                      'Could not unlock. Try again.',
                      'تعذّر فتح القفل. حاول مرة أخرى.',
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    ),
  );
}
