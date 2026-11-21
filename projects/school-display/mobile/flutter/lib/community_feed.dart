import 'dart:typed_data';

import 'package:material_ui/material_ui.dart';

import 'bento.dart';
import 'parent_details.dart';
import 'school_api.dart';

class CommunityFeed extends StatelessWidget {
  const CommunityFeed({
    super.key,
    required this.data,
    required this.arabic,
    required this.refresh,
    required this.photo,
    required this.like,
    required this.comment,
  });

  final SchoolData data;
  final bool arabic;
  final Future<void> Function() refresh;
  final Future<Uint8List> Function(String) photo;
  final Future<void> Function(String, bool) like;
  final Future<void> Function(String, String) comment;

  String tr(String en, String ar) => arabic ? ar : en;

  @override
  Widget build(BuildContext context) {
    final posts = data.rows('posts');
    final school = localizedValue(data.school, 'name', arabic);
    final colors = Theme.of(context).colorScheme;
    return LayoutBuilder(
      builder: (context, constraints) {
        final twoColumns =
            constraints.maxWidth >= 680 &&
            MediaQuery.textScalerOf(context).scale(16) <= 21;
        final columns = twoColumns ? 2 : 1;
        final inset = constraints.maxWidth < 360 ? 12.0 : 20.0;
        return RefreshIndicator(
          onRefresh: refresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverPadding(
                padding: EdgeInsets.fromLTRB(inset, 12, inset, 14),
                sliver: SliverToBoxAdapter(
                  child: BentoCard(
                    featured: true,
                    tile: (
                      title: tr('School community', 'مجتمع المدرسة'),
                      detail: school,
                      icon: Icons.school_outlined,
                    ),
                  ),
                ),
              ),
              SliverPadding(
                padding: EdgeInsets.fromLTRB(inset, 0, inset, 28),
                sliver: posts.isEmpty
                    ? SliverToBoxAdapter(
                        child: BentoCard(
                          tile: (
                            title: tr(
                              'No school posts yet',
                              'لا توجد منشورات بعد',
                            ),
                            detail: tr(
                              'New updates will appear here.',
                              'ستظهر تحديثات المدرسة هنا.',
                            ),
                            icon: Icons.article_outlined,
                          ),
                        ),
                      )
                    : SliverList.builder(
                        itemCount: 1 + ((posts.length - 1) / columns).ceil(),
                        itemBuilder: (context, row) {
                          // Lead with the newest post. The rest can share rows at wide widths.
                          final first = row == 0 ? 0 : 1 + (row - 1) * columns;
                          final count = row == 0 ? 1 : columns;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 14),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                for (
                                  var offset = 0;
                                  offset < count;
                                  offset++
                                ) ...[
                                  if (offset > 0) const SizedBox(width: 14),
                                  Expanded(
                                    child: first + offset >= posts.length
                                        ? const SizedBox.shrink()
                                        : postCard(
                                            context,
                                            posts[first + offset],
                                            colors,
                                            featured: row == 0,
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
          ),
        );
      },
    );
  }

  Widget postCard(
    BuildContext context,
    SchoolRow post,
    ColorScheme colors, {
    required bool featured,
  }) {
    final id = textValue(post, 'id');
    final caption = textValue(post, 'text');
    final date = textValue(post, 'at').split('T').first;
    final liked = post['liked'] == true;
    final theme = Theme.of(context);
    final radius = BorderRadius.circular(featured ? 28 : 20);
    final hasPhoto = post['photo'] == true;
    final postLabel = tr('School post', 'منشور المدرسة');
    return FadeUp(
      key: ValueKey(id),
      child: Material(
        color: colors.surfaceContainer,
        borderRadius: radius,
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            InkWell(
              onTap: () => openCardDetails(
                context,
                title: postLabel,
                icon: Icons.article_outlined,
                arabic: arabic,
                rows: [(title: date, description: caption)],
                media: hasPhoto
                    ? PostPhoto(load: () => photo(id), fullPhoto: true)
                    : null,
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.article_outlined,
                          color: colors.primary,
                          size: 22,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(date, style: theme.textTheme.labelLarge),
                        ),
                        Icon(Icons.chevron_right, color: colors.primary),
                      ],
                    ),
                    const SizedBox(height: 10),
                    if (hasPhoto)
                      ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: PostPhoto(
                          key: ValueKey(id),
                          load: () => photo(id),
                        ),
                      ),
                    if (hasPhoto) const SizedBox(height: 12),
                    Text(
                      caption,
                      maxLines: featured ? 5 : 4,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyLarge,
                    ),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
              child: Wrap(
                spacing: 2,
                runSpacing: 2,
                children: [
                  Semantics(
                    toggled: liked,
                    child: TextButton.icon(
                      style: TextButton.styleFrom(
                        minimumSize: const Size(48, 48),
                      ),
                      onPressed: () => like(id, !liked),
                      icon: Icon(
                        liked ? Icons.favorite : Icons.favorite_border,
                      ),
                      label: Text(
                        '${post['likeCount'] ?? 0} ${tr('Likes', 'إعجاب')}',
                      ),
                    ),
                  ),
                  TextButton.icon(
                    style: TextButton.styleFrom(
                      minimumSize: const Size(48, 48),
                    ),
                    onPressed: () => showComments(context, post),
                    icon: const Icon(Icons.chat_bubble_outline),
                    label: Text(
                      '${post['commentCount'] ?? schoolRows(post['comments']).length} ${tr('Comments', 'تعليق')}',
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> showComments(BuildContext context, SchoolRow post) async {
    final controller = TextEditingController();
    try {
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (sheet) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.viewInsetsOf(sheet).bottom,
          ),
          child: FractionallySizedBox(
            heightFactor: .75,
            child: Column(
              children: [
                ListTile(title: Text(tr('Comments', 'التعليقات'))),
                Expanded(
                  child: ListView(
                    children: [
                      if (!data.showComments)
                        ListTile(
                          title: Text(
                            tr(
                              'The school can read your comment.',
                              'يمكن للمدرسة قراءة تعليقك.',
                            ),
                          ),
                        ),
                      for (final row
                          in data.showComments
                              ? schoolRows(post['comments'])
                              : const <SchoolRow>[])
                        ListTile(
                          title: Text(textValue(row, 'author')),
                          subtitle: Text(textValue(row, 'text')),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: controller,
                          maxLength: 500,
                          decoration: InputDecoration(
                            labelText: tr('Write a comment', 'اكتب تعليقًا'),
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: tr('Send comment', 'أرسل تعليقًا'),
                        icon: const Icon(Icons.send),
                        onPressed: () {
                          final text = controller.text.trim();
                          if (text.isEmpty) return;
                          Navigator.pop(sheet);
                          comment(textValue(post, 'id'), text);
                        },
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    } finally {
      controller.dispose();
    }
  }
}

class PostPhoto extends StatefulWidget {
  const PostPhoto({super.key, required this.load, this.fullPhoto = false});

  final Future<Uint8List> Function() load;
  final bool fullPhoto;

  @override
  State<PostPhoto> createState() => _PostPhotoState();
}

class _PostPhotoState extends State<PostPhoto> {
  late Future<Uint8List> image = widget.load();

  @override
  Widget build(BuildContext context) => AspectRatio(
    aspectRatio: widget.fullPhoto ? 4 / 3 : 16 / 10,
    child: FutureBuilder<Uint8List>(
      future: image,
      builder: (context, snapshot) {
        if (snapshot.hasData)
          return Image.memory(
            snapshot.data!,
            fit: widget.fullPhoto ? BoxFit.contain : BoxFit.cover,
            semanticLabel: Localizations.localeOf(context).languageCode == 'ar'
                ? 'صورة من المدرسة'
                : 'Photo from the school',
          );
        if (snapshot.hasError)
          return Center(
            child: IconButton(
              tooltip: Localizations.localeOf(context).languageCode == 'ar'
                  ? 'أعد تحميل الصورة'
                  : 'Retry photo',
              icon: const Icon(Icons.refresh),
              onPressed: () => setState(() => image = widget.load()),
            ),
          );
        return const ShimmerBlock(height: double.infinity);
      },
    ),
  );
}
