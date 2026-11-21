import 'dart:typed_data';

import 'package:material_ui/material_ui.dart';

import 'bento.dart';
import 'parent_details.dart';
import 'photo_gallery.dart';
import 'school_api.dart';

/// The Home tab: school and teacher posts with photos, likes and comments.
class CommunityFeed extends StatelessWidget {
  const CommunityFeed({
    super.key,
    required this.data,
    required this.arabic,
    required this.refresh,
    required this.photo,
    required this.like,
    required this.comment,
    this.remove,
    this.header,
  });

  final SchoolData data;
  final bool arabic;
  final Future<void> Function() refresh;
  final Future<Uint8List> Function(String id, int index) photo;
  final Future<void> Function(String, bool) like;
  final Future<void> Function(String, String) comment;
  final Future<void> Function(String)? remove;
  final Widget? header;

  String tr(String en, String ar) => arabic ? ar : en;

  @override
  Widget build(BuildContext context) {
    final posts = data.rows('posts');
    final school = localizedValue(data.school, 'name', arabic);
    return LayoutBuilder(
      builder: (context, constraints) {
        final inset = constraints.maxWidth < 360 ? 12.0 : 20.0;
        return RefreshIndicator(
          onRefresh: refresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverPadding(
                padding: EdgeInsets.fromLTRB(inset, 12, inset, 14),
                sliver: SliverToBoxAdapter(
                  child: header ??
                      BentoCard(
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
                padding: EdgeInsets.fromLTRB(inset, 0, inset, 96),
                sliver: posts.isEmpty
                    ? SliverToBoxAdapter(
                        child: BentoCard(
                          tile: (
                            title: tr('No posts yet', 'لا توجد منشورات بعد'),
                            detail: tr(
                              'Updates and photos from the school and teachers will appear here.',
                              'ستظهر هنا تحديثات المدرسة والمعلمين وصورهم.',
                            ),
                            icon: Icons.photo_library_outlined,
                          ),
                        ),
                      )
                    : SliverList.builder(
                        itemCount: posts.length,
                        itemBuilder: (context, index) => Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: Center(
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 640),
                              child: postCard(context, posts[index]),
                            ),
                          ),
                        ),
                      ),
              ),
            ],
          ),
        );
      },
    );
  }

  ({String label, IconData icon, Color color}) kindOf(BuildContext context, SchoolRow post) {
    final colors = Theme.of(context).colorScheme;
    return switch (post['kind']) {
      'classwork' => (label: tr('Classwork', 'أعمال الصف'), icon: Icons.assignment_outlined, color: const Color(0xFFB26A00)),
      'announcement' => (label: tr('Announcement', 'إعلان'), icon: Icons.campaign_outlined, color: const Color(0xFF2E7D32)),
      _ => (label: tr('School post', 'منشور المدرسة'), icon: Icons.school_outlined, color: colors.primary),
    };
  }

  String dateLabel(SchoolRow post) {
    final at = DateTime.tryParse(textValue(post, 'at'))?.toLocal();
    if (at == null) return '';
    final now = DateTime.now();
    final minutes = now.difference(at).inMinutes;
    if (minutes < 1) return tr('Just now', 'الآن');
    if (minutes < 60) return tr('$minutes min ago', 'قبل $minutes د');
    if (minutes < 24 * 60) return tr('${minutes ~/ 60} h ago', 'قبل ${minutes ~/ 60} س');
    return '${at.year}-${at.month.toString().padLeft(2, '0')}-${at.day.toString().padLeft(2, '0')}';
  }

  Widget postCard(BuildContext context, SchoolRow post) {
    final id = textValue(post, 'id');
    final caption = textValue(post, 'text');
    final title = textValue(post, 'title');
    final liked = post['liked'] == true;
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final count = post['photoCount'] is int ? post['photoCount'] as int : (post['photo'] == true ? 1 : 0);
    final kind = kindOf(context, post);
    final author = textValue(post, 'author').isNotEmpty
        ? textValue(post, 'author')
        : localizedValue(data.school, 'name', arabic).isNotEmpty
        ? localizedValue(data.school, 'name', arabic)
        : tr('The school', 'المدرسة');
    void details() => openCardDetails(
      context,
      title: title.isNotEmpty ? title : kind.label,
      icon: kind.icon,
      arabic: arabic,
      rows: [(title: '$author · ${dateLabel(post)}', description: caption)],
      media: count > 0 ? PostGallery(count: count, load: (index) => photo(id, index)) : null,
    );
    return FadeUp(
      key: ValueKey(id),
      // Each post is one group for screen readers, with its buttons and photos reachable on their own.
      child: Semantics(
        container: true,
        explicitChildNodes: true,
        child: Material(
        color: colors.surfaceContainer,
        borderRadius: BorderRadius.circular(24),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(14, 12, 4, 8),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 20,
                    backgroundColor: kind.color.withValues(alpha: .15),
                    child: Icon(kind.icon, color: kind.color, size: 20),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(author, maxLines: 1, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                        Text('${kind.label} · ${dateLabel(post)}', style: theme.textTheme.bodySmall?.copyWith(color: colors.onSurfaceVariant)),
                      ],
                    ),
                  ),
                  if (post['mine'] == true && remove != null)
                    PopupMenuButton<String>(
                      tooltip: tr('Post options', 'خيارات المنشور'),
                      onSelected: (_) => confirmRemove(context, id),
                      itemBuilder: (_) => [
                        PopupMenuItem(value: 'remove', child: Text(tr('Remove post', 'حذف المنشور'))),
                      ],
                    ),
                ],
              ),
            ),
            if (count > 0)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: PostGallery(
                  key: ValueKey('$id:$count'),
                  count: count,
                  load: (index) => photo(id, index),
                ),
              ),
            InkWell(
              onTap: details,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (title.isNotEmpty) ...[
                      Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                    ],
                    Text(caption, maxLines: 5, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodyLarge),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(6, 0, 6, 6),
              child: Wrap(
                spacing: 2,
                children: [
                  Semantics(
                    container: true,
                    toggled: liked,
                    child: TextButton.icon(
                      style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
                      onPressed: () => like(id, !liked),
                      icon: Icon(liked ? Icons.favorite : Icons.favorite_border, color: liked ? const Color(0xFFD93F5C) : null),
                      label: Text('${post['likeCount'] ?? 0} ${tr('Likes', 'إعجاب')}'),
                    ),
                  ),
                  TextButton.icon(
                    style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
                    onPressed: () => showComments(context, post),
                    icon: const Icon(Icons.chat_bubble_outline),
                    label: Text('${post['commentCount'] ?? schoolRows(post['comments']).length} ${tr('Comments', 'تعليق')}'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      ),
    );
  }

  Future<void> confirmRemove(BuildContext context, String id) async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(tr('Remove this post?', 'حذف هذا المنشور؟')),
        content: Text(tr('Families will no longer see it.', 'لن يراه أولياء الأمور بعد الآن.')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialog, false), child: Text(tr('Cancel', 'إلغاء'))),
          FilledButton(onPressed: () => Navigator.pop(dialog, true), child: Text(tr('Remove', 'حذف'))),
        ],
      ),
    );
    if (sure == true) await remove?.call(id);
  }

  Future<void> showComments(BuildContext context, SchoolRow post) async {
    final controller = TextEditingController();
    try {
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (sheet) => Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(sheet).bottom),
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
                          title: Text(tr('The school can read your comment.', 'يمكن للمدرسة قراءة تعليقك.')),
                        ),
                      for (final row in data.showComments ? schoolRows(post['comments']) : const <SchoolRow>[])
                        ListTile(
                          leading: const CircleAvatar(child: Icon(Icons.person_outline)),
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
                          decoration: InputDecoration(labelText: tr('Write a comment', 'اكتب تعليقًا')),
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
