import 'dart:convert';

import 'package:faslii_layout/school_api.dart';
import 'package:faslii_layout/school_cards.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  for (final edition in Edition.values) {
    test('${edition.name} sends a role and gets scoped school cards', () async {
      final requests = <String>[];
      final client = MockClient((request) async {
        requests.add(request.url.path);
        expect(request.url.scheme, 'https');
        expect(
          request.headers.keys.map((key) => key.toLowerCase()),
          isNot(contains('cookie')),
        );
        if (request.url.path.endsWith('/login')) {
          expect(jsonDecode(request.body)['audience'], edition.name);
          return http.Response('{"token":"test-session"}', 200);
        }
        expect(request.headers['authorization'], 'Bearer test-session');
        if (request.url.path.endsWith('/logout'))
          return http.Response('{"ok":true}', 200);
        if (request.url.path.endsWith('/timetable'))
          expect(request.url.queryParameters['view'], 'cards');
        return http.Response(
          jsonEncode({
            'role': edition.name,
            'days': [
              {
                'date': '2026-11-20',
                'rows': [
                  {
                    'classId': 'a',
                    'mine': true,
                    'subjectEn': 'Mathematics',
                    'start': '08:00',
                    'end': '09:00',
                  },
                  {
                    'classId': 'b',
                    'mine': false,
                    'subjectEn': 'Other lesson',
                    'start': '09:00',
                    'end': '10:00',
                  },
                ],
              },
            ],
            'classes': [
              {'id': 'a', 'nameEn': 'Grade 5'},
              {'id': 'b', 'nameEn': 'Grade 6'},
            ],
          }),
          200,
        );
      });
      final api = SchoolApi(edition, client: client);
      addTearDown(api.close);
      final snapshot = await api.signIn(
        email: 'person@example.test',
        password: 'test',
      );
      final card = SchoolCards(
        snapshot,
        edition,
        false,
        edition == Edition.parent ? {'id': 'p', 'classId': 'a'} : {'id': 'a'},
      );
      expect(card.details(SchoolCard.timetable).map((row) => row.title), [
        'Mathematics',
      ]);
      await api.signOut();
      // Both apps load lessons and the school feed together.
      expect(requests, [
        '/api/mobile/login',
        '/api/mobile/timetable',
        '/api/mobile/community',
        '/api/mobile/logout',
      ]);
    });
  }
}
