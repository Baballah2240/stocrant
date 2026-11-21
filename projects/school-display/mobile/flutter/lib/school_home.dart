import 'dart:async';

import 'package:material_ui/material_ui.dart';

import 'app_settings.dart';
import 'bento.dart';
import 'classwork_page.dart';
import 'community_feed.dart';
import 'compose_post.dart';
import 'lessons_page.dart';
import 'notifications_page.dart';
import 'photo_gallery.dart';
import 'pick_files.dart';
import 'school_api.dart';
import 'sign_in_surface.dart';

class SchoolHome extends StatefulWidget {
  const SchoolHome({
    super.key,
    required this.edition,
    required this.onLanguage,
    required this.settings,
    required this.mode,
    required this.onMode,
  });

  final Edition edition;
  final ValueChanged<bool> onLanguage;
  final Widget Function(bool arabic) settings;
  final ThemeMode mode;
  final ValueChanged<ThemeMode> onMode;

  @override
  State<SchoolHome> createState() => _SchoolHomeState();
}

class _SchoolHomeState extends State<SchoolHome> {
  late final SchoolApi api = SchoolApi(widget.edition);
  final email = TextEditingController();
  final password = TextEditingController();
  final name = TextEditingController();
  final code = TextEditingController();
  final loginForm = GlobalKey<FormState>();
  SchoolData? data;
  Object? selectionId;
  bool busy = false;
  bool registering = false;
  bool showPassword = false;
  SchoolRow school = {};
  bool writing = false;
  int tab = 0;
  final seenNoticeIds = <String>{};
  Timer? updates;
  int? error;

  bool get parent => widget.edition == Edition.parent;
  bool get arabic => Localizations.localeOf(context).languageCode == 'ar';
  String tr(String en, String ar) => arabic ? ar : en;

  @override
  void initState() {
    super.initState();
    loadSchoolName();
    updates = Timer.periodic(const Duration(seconds: 30), (_) {
      if (data != null && !writing) load(authenticate: false);
    });
  }

  @override
  void dispose() {
    updates?.cancel();
    api.close();
    email.dispose();
    password.dispose();
    name.dispose();
    code.dispose();
    super.dispose();
  }

  Future<void> loadSchoolName() async {
    try {
      final profile = await api.schoolName();
      if (mounted && data == null) setState(() => school = profile);
    } catch (_) {
      // The sign-in form remains usable if branding is temporarily unavailable.
    }
  }

  Future<void> load({
    required bool authenticate,
    bool afterWrite = false,
  }) async {
    if (busy ||
        (!authenticate && (data == null || (writing && !afterWrite))) ||
        (authenticate && loginForm.currentState?.validate() != true))
      return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final snapshot = authenticate
          ? await api.signIn(
              email: email.text,
              password: password.text,
              code: registering ? code.text : null,
              name: registering ? name.text : null,
            )
          : await api.refresh();
      if (mounted) {
        password.clear();
        code.clear();
        setState(() {
          data = snapshot;
          school = snapshot.school;
          showPassword = false;
          registering = false;
        });
      }
    } on SchoolApiException catch (failure) {
      if (!mounted) return;
      if (!authenticate && (failure.status == 401 || failure.status == 403)) {
        await api.signOut();
        if (mounted) setState(clearSessionView);
      }
      if (mounted) setState(() => error = failure.status);
    } catch (_) {
      if (mounted) setState(() => error = 0);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> signOut() async {
    if (busy) return;
    setState(() {
      busy = true;
      clearSessionView();
      error = null;
    });
    await api.signOut();
    if (mounted) setState(() => busy = false);
  }

  void clearSessionView() {
    data = null;
    selectionId = null;
    tab = 0;
    seenNoticeIds.clear();
  }

  String? get errorText => switch (error) {
    null => null,
    401 => tr(
      'Check your sign-in details or sign in again.',
      'تحقق من بيانات الدخول أو سجّل الدخول مجددًا.',
    ),
    403 when registering => tr(
      'Check the school community code.',
      'تحقق من رمز مجتمع المدرسة.',
    ),
    409 when registering => tr(
      'This email is already registered. Sign in instead.',
      'هذا البريد مسجل بالفعل. سجّل الدخول.',
    ),
    403 => tr(
      'This account cannot sign in to this app. Check with your school.',
      'لا يمكن لهذا الحساب الدخول إلى هذا التطبيق. تواصل مع المدرسة.',
    ),
    429 => tr(
      'Too many attempts. Wait a moment and try again.',
      'محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.',
    ),
    >= 400 && < 500 => tr(
      'The school did not accept those details.',
      'لم تقبل المدرسة هذه البيانات.',
    ),
    _ => tr(
      'Could not reach the school server. Try again.',
      'تعذّر الاتصال بخادم المدرسة. حاول مرة أخرى.',
    ),
  };

  @override
  Widget build(BuildContext context) {
    final snapshot = data;
    final items = snapshot == null ? const <NoticeItem>[] : collectNotices(snapshot, arabic);
    final unread = items.where((item) => !seenNoticeIds.contains(item.id)).length;
    return Scaffold(
      floatingActionButton: snapshot != null && !parent && tab == 0
          ? FloatingActionButton.extended(
              onPressed: compose,
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: Text(tr('New post', 'منشور جديد')),
            )
          : null,
      bottomNavigationBar: snapshot == null
          ? null
          : NavigationBar(
              selectedIndex: tab,
              onDestinationSelected: (index) => setState(() => tab = index),
              destinations: [
                NavigationDestination(
                  icon: const Icon(Icons.home_outlined),
                  selectedIcon: const Icon(Icons.home),
                  label: tr('Home', 'الرئيسية'),
                ),
                NavigationDestination(
                  icon: const Icon(Icons.schedule_outlined),
                  selectedIcon: const Icon(Icons.schedule),
                  label: tr('Lessons', 'الحصص'),
                ),
                NavigationDestination(
                  icon: const Icon(Icons.assignment_outlined),
                  selectedIcon: const Icon(Icons.assignment),
                  label: tr('Classwork', 'أعمال الصف'),
                ),
              ],
            ),
      appBar: AppBar(
        title: snapshot == null
            ? null
            : Text(
                localizedValue(school, 'name', arabic).isNotEmpty
                    ? localizedValue(school, 'name', arabic)
                    : parent
                    ? tr('Faslii Parent', 'فصلي لولي الأمر')
                    : tr('Faslii Teacher', 'فصلي للمعلم'),
              ),
        actions: [
          if (snapshot != null)
            IconButton(
              tooltip: tr('Notifications', 'الإشعارات'),
              onPressed: () => showNotifications(items),
              icon: Badge(
                isLabelVisible: unread > 0,
                label: Text(unread > 9 ? '9+' : '$unread'),
                child: const Icon(Icons.notifications_outlined),
              ),
            ),
        ],
      ),
      drawerEnableOpenDragGesture: true,
      drawer: snapshot == null
          ? SignInMenu(
              tr: tr,
              arabic: arabic,
              mode: widget.mode,
              onMode: widget.onMode,
              onLanguage: widget.onLanguage,
            )
          : FasliiMenu(
              tr: tr,
              arabic: arabic,
              onLanguage: widget.onLanguage,
              openSettings: () => Navigator.of(context).push<void>(
                MaterialPageRoute(builder: (_) => widget.settings(arabic)),
              ),
              onSignOut: signOut,
            ),
      body: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 880),
            child: snapshot == null ? signInForm() : signedIn(snapshot),
          ),
        ),
      ),
    );
  }

  Widget errorBanner() => switch (errorText) {
    final String message => Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 12),
      child: Semantics(liveRegion: true, child: Text(message)),
    ),
    null => const SizedBox.shrink(),
  };

  Widget signInForm() {
    final schoolName = localizedValue(school, 'name', arabic);
    return SignInSurface(
      schoolName: schoolName.isEmpty ? tr('Faslii', 'فصلي') : schoolName,
      role: parent
          ? tr('Parent app', 'تطبيق ولي الأمر')
          : tr('Teacher app', 'تطبيق المعلم'),
      child: AutofillGroup(
        child: Form(
          key: loginForm,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                registering
                    ? tr('Join with an invitation', 'انضم باستخدام رمز الدعوة')
                    : tr('Sign in', 'تسجيل الدخول'),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 18),
              if (registering) ...[
                field(name, tr('Your display name', 'اسم العرض الخاص بك')),
                field(code, tr('School community code', 'رمز مجتمع المدرسة')),
              ],
              field(email, tr('Email', 'البريد الإلكتروني'), emailField: true),
              field(password, tr('Password', 'كلمة المرور'), secret: true),
              errorBanner(),
              if (busy)
                const ShimmerBlock(height: 48)
              else
                FilledButton(
                  onPressed: () => load(authenticate: true),
                  child: Text(
                    registering
                        ? tr('Join', 'انضم')
                        : tr('Sign in', 'تسجيل الدخول'),
                  ),
                ),
              if (parent)
                TextButton(
                  onPressed: busy
                      ? null
                      : () => setState(() {
                          registering = !registering;
                          showPassword = false;
                          error = null;
                        }),
                  child: Text(
                    registering
                        ? tr('Back to sign in', 'العودة لتسجيل الدخول')
                        : tr('I have an invitation code', 'لدي رمز دعوة'),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget field(
    TextEditingController controller,
    String label, {
    bool emailField = false,
    bool secret = false,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextFormField(
      controller: controller,
      enabled: !busy,
      textAlign: TextAlign.center,
      obscureText: secret && !showPassword,
      enableSuggestions: !secret,
      textInputAction: secret ? TextInputAction.done : TextInputAction.next,
      autofillHints: emailField
          ? const [AutofillHints.email]
          : secret
          ? [registering ? AutofillHints.newPassword : AutofillHints.password]
          : null,
      autocorrect: !secret && !emailField,
      keyboardType: emailField
          ? TextInputType.emailAddress
          : TextInputType.text,
      decoration: InputDecoration(
        label: Center(child: Text(label, textAlign: TextAlign.center)),
        floatingLabelBehavior: FloatingLabelBehavior.never,
        filled: true,
        fillColor: Theme.of(context).colorScheme.surface.withValues(alpha: .64),
        prefixIcon: secret ? const SizedBox(width: 48) : null,
        suffixIcon: secret
            ? IconButton(
                tooltip: showPassword
                    ? tr('Hide password', 'إخفاء كلمة المرور')
                    : tr('Show password', 'إظهار كلمة المرور'),
                icon: Icon(
                  showPassword
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined,
                ),
                onPressed: () => setState(() => showPassword = !showPassword),
              )
            : null,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(18)),
      ),
      validator: (value) {
        if (value == null || value.trim().isEmpty)
          return tr('Required', 'مطلوب');
        if (emailField && !RegExp(r'^\S+@\S+\.\S+$').hasMatch(value.trim())) {
          return tr(
            'Enter a valid email address.',
            'أدخل بريدًا إلكترونيًا صالحًا.',
          );
        }
        if (secret && registering && value.length < 12) {
          return tr(
            'Use at least 12 characters.',
            'استخدم ١٢ حرفًا على الأقل.',
          );
        }
        return null;
      },
      onFieldSubmitted: secret ? (_) => load(authenticate: true) : null,
    ),
  );

  Future<void> showNotifications(List<NoticeItem> items) =>
      Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => NotificationsPage(
            items: items,
            seen: {...seenNoticeIds},
            onSeen: (ids) => setState(() => seenNoticeIds.addAll(ids)),
          ),
        ),
      );

  Future<bool> writeToSchool(Future<void> Function() request) async {
    if (writing || busy) return false;
    writing = true;
    try {
      await request();
      if (mounted) await load(authenticate: false, afterWrite: true);
      return true;
    } on SchoolApiException catch (failure) {
      if (mounted) setState(() => error = failure.status);
    } catch (_) {
      if (mounted) setState(() => error = 0);
    } finally {
      writing = false;
    }
    return false;
  }

  void toast(String en, String ar) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(tr(en, ar))));

  Future<void> compose() async {
    final posted = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => ComposePostPage(
          arabic: arabic,
          submit: ({required title, required text, required photos}) =>
              writeToSchool(
                () => api.postAnnouncement(
                  title: title,
                  text: text,
                  photos: photos,
                ),
              ),
        ),
      ),
    );
    if (posted == true && mounted) {
      toast('Posted to Home.', 'نُشر في الصفحة الرئيسية.');
    }
  }

  Future<void> openSubmission(SchoolRow row) async {
    final name = textValue(row, 'name');
    try {
      final bytes = await api.submission(textValue(row, 'id'));
      if (!mounted) return;
      if (photoTypes.containsKey(extensionOf(name))) {
        await Navigator.of(context).push<void>(
          MaterialPageRoute(
            builder: (_) => PhotoViewer(
              count: 1,
              cache: PhotoCache((_) async => bytes),
            ),
          ),
        );
        return;
      }
      if (await saveDownloadedFile(name, bytes) && mounted) {
        toast('File saved.', 'حُفظ الملف.');
      }
    } catch (_) {
      if (mounted) {
        toast('Could not open the file. Try again.', 'تعذّر فتح الملف. حاول مرة أخرى.');
      }
    }
  }

  Widget withBanner(Widget child) => Column(
    children: [
      if (busy) const LinearProgressIndicator(minHeight: 2),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: errorBanner(),
      ),
      Expanded(child: child),
    ],
  );

  Widget signedIn(SchoolData snapshot) {
    Future<bool> link(String value) => writeToSchool(() => api.linkChild(value));
    return IndexedStack(
      index: tab,
      children: [
        withBanner(
          CommunityFeed(
            data: snapshot,
            arabic: arabic,
            refresh: () => load(authenticate: false),
            photo: api.photo,
            like: (id, liked) async {
              await writeToSchool(() => api.like(id, liked));
            },
            comment: (id, text) async {
              await writeToSchool(() => api.comment(id, text));
            },
            remove: parent
                ? null
                : (id) async {
                    await writeToSchool(() => api.removePost(id));
                  },
            header: HomeHeader(data: snapshot, arabic: arabic, parent: parent),
          ),
        ),
        withBanner(
          LessonsPage(
            data: snapshot,
            edition: widget.edition,
            arabic: arabic,
            selection: selectionId,
            onSelect: (value) => setState(() => selectionId = value),
            refresh: () => load(authenticate: false),
            linkChild: link,
          ),
        ),
        withBanner(
          ClassworkPage(
            data: snapshot,
            parent: parent,
            arabic: arabic,
            selection: selectionId,
            onSelect: (value) => setState(() => selectionId = value),
            refresh: () => load(authenticate: false),
            postWork: (body) => writeToSchool(() => api.postWork(body)),
            removeWork: (id) => writeToSchool(() => api.removeWork(id)),
            submitFile: (workId, studentId, file) => writeToSchool(
              () => api.submitWork(
                workId: workId,
                studentId: studentId,
                name: file.name,
                data: file.data,
              ),
            ),
            openSubmission: openSubmission,
            linkChild: link,
          ),
        ),
      ],
    );
  }
}

/// A short greeting above the Home feed.
class HomeHeader extends StatelessWidget {
  const HomeHeader({
    super.key,
    required this.data,
    required this.arabic,
    required this.parent,
  });

  final SchoolData data;
  final bool arabic;
  final bool parent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final school = localizedValue(data.school, 'name', arabic);
    final count = data.rows('posts').length;
    return FadeUp(
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: colors.surfaceContainer,
          borderRadius: BorderRadius.circular(26),
        ),
        child: Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: colors.primary.withValues(alpha: .14),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(Icons.school_outlined, color: colors.primary, size: 28),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    school.isEmpty ? (arabic ? 'مجتمع المدرسة' : 'School community') : school,
                    style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    arabic
                        ? (parent ? 'آخر أخبار المدرسة وصورها' : 'شارك أخبار صفك مع أولياء الأمور')
                        : (parent ? 'Latest news and photos from school' : 'Share class news with families'),
                    style: theme.textTheme.bodyMedium?.copyWith(color: colors.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            if (count > 0)
              Text(
                arabic ? '$count منشور' : '$count posts',
                style: theme.textTheme.labelLarge?.copyWith(color: colors.primary),
              ),
          ],
        ),
      ),
    );
  }
}
