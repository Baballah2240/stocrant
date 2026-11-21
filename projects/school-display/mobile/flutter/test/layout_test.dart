import 'package:faslii_layout/school_api.dart';
import 'package:local_auth_platform_interface/local_auth_platform_interface.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';
import 'package:faslii_layout/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });
  for (final edition in Edition.values) {
    testWidgets(
      'signed-out ${edition.name} menu exposes appearance and language only',
      (tester) async {
        await tester.binding.setSurfaceSize(const Size(320, 620));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.pumpWidget(Faslii(edition: edition));
        await tester.pumpAndSettle();
        expect(find.byType(Image), findsOneWidget);
        expect(find.byType(BackdropFilter), findsOneWidget);
        await tester.tap(find.byIcon(Icons.menu));
        await tester.pumpAndSettle();
        expect(find.text('المظهر'), findsOneWidget);
        expect(find.text('اللغة'), findsOneWidget);
        expect(find.text('الإعدادات'), findsNothing);
        expect(find.text('قفل التطبيق'), findsNothing);
        expect(find.text('التحقق من وجود تحديث'), findsNothing);
        await tester.tap(find.text('English'));
        await tester.pumpAndSettle();
        expect(find.text('Sign in'), findsWidgets);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets('Arabic is the default and the parent card opens full screen', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(const Faslii());
    await tester.pumpAndSettle();
    expect(
      Directionality.of(tester.element(find.text('فصلي'))),
      TextDirection.rtl,
    );

    await tester.tap(find.text('جدول اليوم'));
    await tester.pumpAndSettle();
    expect(find.text('العلوم · ١٠:١٥'), findsOneWidget);
    expect(find.text('الصف ٥ أ · اليوم'), findsNothing);

    await tester.tap(find.text('رجوع'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('الإعلانات'),
      180,
      scrollable: find.byType(Scrollable),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('الإعلانات'));
    await tester.pumpAndSettle();
    expect(find.text('اجتماع أولياء الأمور'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('RTL sidebar opens by swiping and switches language', (
    tester,
  ) async {
    await tester.pumpWidget(const Faslii());
    await tester.pumpAndSettle();
    await tester.dragFrom(const Offset(799, 230), const Offset(-260, 0));
    await tester.pumpAndSettle();

    expect(find.text('الإعدادات'), findsOneWidget);
    await tester.tap(find.text('English'));
    await tester.pumpAndSettle();
    expect(
      Directionality.of(tester.element(find.text('Faslii'))),
      TextDirection.ltr,
    );

    await tester.tap(find.text('Teacher'));
    await tester.pump();
    expect(find.byType(ShimmerBlock), findsWidgets);
    await tester.pump(const Duration(milliseconds: 450));
    await tester.pumpAndSettle();
    expect(find.text('Your school day'), findsOneWidget);
  });

  testWidgets(
    'menu settings expose app lock, update check and dark appearance',
    (tester) async {
      debugDefaultTargetPlatformOverride = TargetPlatform.windows;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);
      await tester.pumpWidget(const Faslii());
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.menu));
      await tester.pumpAndSettle();
      await tester.tap(find.text('الإعدادات'));
      await tester.pumpAndSettle();

      expect(find.text('التحقق من وجود تحديث'), findsOneWidget);
      expect(
        tester.widget<SwitchListTile>(find.byType(SwitchListTile)).onChanged,
        isNull,
      );
      await tester.tap(find.text('النظام'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('داكن').last);
      await tester.pumpAndSettle();

      final settings = tester.element(find.text('الإعدادات'));
      expect(Theme.of(settings).colorScheme.onSurface, Colors.white);
    },
  );

  testWidgets(
    'native lock requires successful biometric authentication on launch and return',
    (tester) async {
      final original = LocalAuthPlatform.instance;
      final auth = FakeBiometrics();
      LocalAuthPlatform.instance = auth;
      addTearDown(() => LocalAuthPlatform.instance = original);
      SharedPreferencesAsyncPlatform.instance =
          InMemorySharedPreferencesAsync.withData({'appLock': true});
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpWidget(const Faslii());
      await tester.pumpAndSettle();
      expect(find.text('تطبيق فصلي مقفل'), findsOneWidget);
      expect(find.text('جدول اليوم'), findsNothing);

      await tester.tap(find.text('فتح القفل'));
      await tester.pumpAndSettle();
      expect(find.text('تعذّر فتح القفل. حاول مرة أخرى.'), findsOneWidget);
      expect(auth.requestedBiometrics, isTrue);

      auth.accept = true;
      await tester.tap(find.text('فتح القفل'));
      await tester.pumpAndSettle();
      expect(find.text('جدول اليوم'), findsOneWidget);

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(find.text('تطبيق فصلي مقفل'), findsOneWidget);
    },
  );
}

class FakeBiometrics extends LocalAuthPlatform {
  bool accept = false;
  bool requestedBiometrics = false;

  @override
  Future<bool> authenticate({
    required String localizedReason,
    required Iterable<AuthMessages> authMessages,
    AuthenticationOptions options = const AuthenticationOptions(),
  }) async {
    requestedBiometrics = options.biometricOnly;
    return accept;
  }
}
