import 'package:faslii_layout/community_feed.dart';
import 'package:faslii_layout/school_api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  testWidgets(
    'compact Arabic community opens a post and returns to its actions',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 660));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      var liked = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Directionality(
              textDirection: TextDirection.rtl,
              child: CommunityFeed(
                data: SchoolData({
                  'school': {'nameAr': 'مدرسة فصلي'},
                  'posts': [
                    {
                      'id': 'p1',
                      'text': 'لقاء المجتمع المدرسي',
                      'at': '2026-11-20T10:00:00Z',
                      'likeCount': 0,
                      'commentCount': 3,
                      'comments': [
                        {'author': 'Test author', 'text': 'Private comment'},
                      ],
                    },
                  ],
                }),
                arabic: true,
                refresh: () async {},
                photo: (_) async => throw StateError('This post has no image'),
                like: (_, value) async {
                  liked = value;
                },
                comment: (_, _) async {},
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('مجتمع المدرسة'), findsOneWidget);
      await tester.tap(find.text('لقاء المجتمع المدرسي'));
      await tester.pumpAndSettle();
      expect(find.text('منشور المدرسة'), findsOneWidget);
      await tester.tap(find.text('رجوع'));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.favorite_border));
      expect(liked, isTrue);
      await tester.tap(find.byIcon(Icons.chat_bubble_outline));
      await tester.pumpAndSettle();
      expect(find.text('التعليقات'), findsOneWidget);
      expect(find.text('3 تعليق'), findsOneWidget);
      expect(find.text('Private comment'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
