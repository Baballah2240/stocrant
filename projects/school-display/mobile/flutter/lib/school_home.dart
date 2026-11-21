import 'dart:async';

import 'package:material_ui/material_ui.dart';

import 'app_settings.dart';
import 'bento.dart';
import 'classwork_form.dart';
import 'community_feed.dart';
import 'parent_details.dart';
import 'school_api.dart';
import 'sign_in_surface.dart';
import 'school_cards.dart';

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
  List<SchoolRow> notices = [];
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
        try {
          final items = parent
              ? snapshot.rows('items')
              : await api.notifications();
          if (mounted) setState(() => notices = items);
        } catch (_) {
          // A temporary notification failure does not hide the published timetable.
        }
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
    notices = [];
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
    return Scaffold(
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
              onPressed: showNotifications,
              icon: Badge(
                isLabelVisible: notices.any(
                  (row) => !seenNoticeIds.contains(row['id']),
                ),
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
            child: snapshot == null
                ? signInForm()
                : parent
                ? community(snapshot)
                : dashboard(snapshot),
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

  Future<void> showNotifications() async {
    final current = notices;
    setState(
      () => seenNoticeIds.addAll(current.map((row) => textValue(row, 'id'))),
    );
    await openCardDetails(
      context,
      title: tr('Notifications', 'الإشعارات'),
      icon: Icons.notifications_outlined,
      arabic: arabic,
      rows: [
        for (final row in current)
          (title: textValue(row, 'title'), description: textValue(row, 'text')),
      ],
    );
  }

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

  Widget community(SchoolData snapshot) => Column(
    children: [
      if (busy) const LinearProgressIndicator(),
      errorBanner(),
      Expanded(
        child: CommunityFeed(
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
        ),
      ),
    ],
  );

  Widget nextLesson(SchoolData snapshot, SchoolCards cards) {
    final next = snapshot.next;
    final heading = tr('Next lesson', 'الحصة التالية');
    final topic = next == null ? '' : localizedValue(next, 'subject', arabic);
    final information = next == null
        ? tr(
            'No upcoming lessons in the published timetable.',
            'لا توجد حصص قادمة في الجدول المنشور.',
          )
        : [
            if (topic.isNotEmpty) topic,
            cards.className(next['classId']),
            textValue(next, 'date'),
            '${next['start']}–${next['end']}',
            localizedValue(next, 'teacher', arabic),
            if (textValue(next, 'room').isNotEmpty)
              '${tr('Room', 'القاعة')} · ${next['room']}',
          ].where((value) => value.isNotEmpty).join('\n');
    return BentoCard(
      featured: true,
      tile: (
        title: heading,
        detail: information,
        icon: Icons.schedule_outlined,
      ),
      onTap: next == null
          ? null
          : () => openCardDetails(
              context,
              title: topic.isEmpty ? heading : topic,
              icon: Icons.schedule_outlined,
              arabic: arabic,
              rows: [
                (
                  title: cards.className(next['classId']),
                  description: information,
                ),
              ],
            ),
    );
  }

  Widget dashboard(SchoolData snapshot) {
    final options = snapshot
        .rows('classes')
        .where((row) => snapshot.assignedClasses.contains(row['id']))
        .toList();
    final selected =
        options.where((row) => row['id'] == selectionId).firstOrNull ??
        options.firstOrNull;
    final cards = SchoolCards(snapshot, widget.edition, arabic, selected);
    final colors = Theme.of(context).colorScheme;
    final school = localizedValue(snapshot.school, 'name', arabic);

    return LayoutBuilder(
      builder: (context, constraints) {
        final columns =
            constraints.maxWidth >= 680 &&
                MediaQuery.textScalerOf(context).scale(16) <= 21
            ? 2
            : 1;
        final inset = constraints.maxWidth < 360 ? 12.0 : 20.0;
        return RefreshIndicator(
          onRefresh: () => load(authenticate: false),
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverPadding(
                padding: EdgeInsets.fromLTRB(inset, 12, inset, 14),
                sliver: SliverToBoxAdapter(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              school,
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                          ),
                          IconButton(
                            tooltip: tr(
                              'Refresh from school',
                              'تحديث من المدرسة',
                            ),
                            onPressed: busy
                                ? null
                                : () => load(authenticate: false),
                            icon: const Icon(Icons.refresh),
                          ),
                        ],
                      ),
                      if (busy)
                        const Padding(
                          padding: EdgeInsets.only(bottom: 8),
                          child: ShimmerBlock(height: 6),
                        ),
                      errorBanner(),
                      nextLesson(snapshot, cards),
                      if (selected != null) ...[
                        const SizedBox(height: 14),
                        Material(
                          color: colors.surfaceContainer,
                          borderRadius: BorderRadius.circular(20),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 6,
                            ),
                            child: DropdownButtonFormField<Object>(
                              key: ValueKey(selected['id']),
                              initialValue: selected['id'] as Object,
                              isExpanded: true,
                              decoration: InputDecoration(
                                labelText: tr('Class', 'الصف'),
                                border: InputBorder.none,
                              ),
                              items: [
                                for (final option in options)
                                  DropdownMenuItem(
                                    value: option['id'] as Object,
                                    child: Text(
                                      cards.nameOf(option),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                              ],
                              onChanged: (value) =>
                                  setState(() => selectionId = value),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              SliverPadding(
                padding: EdgeInsets.symmetric(horizontal: inset),
                sliver: SliverList.builder(
                  itemCount: (SchoolCard.values.length / columns).ceil(),
                  itemBuilder: (context, row) => Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (var offset = 0; offset < columns; offset++) ...[
                          if (offset > 0) const SizedBox(width: 14),
                          Expanded(
                            child: teacherCard(
                              cards,
                              SchoolCard.values[row * columns + offset],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
              if (selected != null && DateTime.tryParse(snapshot.today) != null)
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(inset, 0, inset, 28),
                  sliver: SliverToBoxAdapter(
                    child: FadeUp(
                      child: Material(
                        color: colors.surfaceContainer,
                        borderRadius: BorderRadius.circular(28),
                        child: Padding(
                          padding: const EdgeInsets.all(18),
                          child: ClassworkForm(
                            key: ValueKey(selected['id']),
                            classId: selected['id'] as Object,
                            today: snapshot.today,
                            arabic: arabic,
                            submit: (body) =>
                                writeToSchool(() => api.postWork(body)),
                          ),
                        ),
                      ),
                    ),
                  ),
                )
              else
                const SliverToBoxAdapter(child: SizedBox(height: 14)),
            ],
          ),
        );
      },
    );
  }

  Widget teacherCard(SchoolCards cards, SchoolCard card) {
    final description = switch (card) {
      SchoolCard.timetable => tr('Your published lessons', 'حصصك المنشورة'),
      SchoolCard.attendance => tr(
        'Attendance records for the selected class',
        'سجل حضور الصف المحدد',
      ),
      SchoolCard.work => tr(
        'Assignments and exams for the selected class',
        'واجبات واختبارات الصف المحدد',
      ),
      SchoolCard.announcements => tr(
        'Updates from the school',
        'تحديثات المدرسة',
      ),
    };
    return BentoCard(
      tile: (
        title: cards.title(card),
        detail: description,
        icon: cards.icon(card),
      ),
      onTap: () => openCardDetails(
        context,
        title: cards.title(card),
        icon: cards.icon(card),
        arabic: arabic,
        rows: cards.details(card),
      ),
    );
  }
}
