export interface PostTemplateSettings {
  share_buttons: boolean;
  author_box: boolean;
  related_posts: boolean;
  comments_section: boolean;
  sidebar: boolean;
  sidebar_latest: boolean;
  sidebar_latest_count: number;
  sidebar_trending: boolean;
  sidebar_trending_count: number;
  sidebar_title_font_size: number;
  intro_thumbnail: boolean;
  post_meta: boolean;
  breadcrumb: boolean;
  chapters: boolean;
  may_you_like: boolean;
  may_you_like_count: number;
  may_you_like_after_paragraph: number;
  read_from_start: boolean;
  fb_comment_copy: boolean;
  fb_comment_copy_text: string;
  font_title: number;
  font_h2: number;
  font_h3: number;
  font_h4: number;
  font_h5: number;
  font_h6: number;
  font_p: number;
  /** Font size (px) for the intro/chapter breadcrumb — "Post Title ·
   *  Chapter N of M" / "SEP 13, 2026 · 6 CHAPTERS" — kept separate from
   *  font_title/font_h2/etc since this text sits above the title, not
   *  inside the article body those control. Real gap this fills: the
   *  breadcrumb previously had a hardcoded font-size with no admin
   *  control over it at all, unlike every other text size on the page. */
  breadcrumb_font_size: number;
}

export const POST_TEMPLATE_DEFAULTS: PostTemplateSettings = {
  share_buttons: true,
  author_box: true,
  related_posts: true,
  comments_section: true,
  sidebar: true,
  sidebar_latest: true,
  sidebar_latest_count: 5,
  sidebar_trending: true,
  sidebar_trending_count: 5,
  sidebar_title_font_size: 18,
  intro_thumbnail: false,
  post_meta: true,
  breadcrumb: true,
  chapters: true,
  may_you_like: true,
  may_you_like_count: 4,
  may_you_like_after_paragraph: 3,
  read_from_start: false,
  fb_comment_copy: true,
  fb_comment_copy_text: "Just watched Part 2... wasn't expecting that ending! Here's the link \u{1F449} ",
  font_title: 24,
  font_h2: 18,
  font_h3: 16,
  font_h4: 15,
  font_h5: 14,
  font_h6: 13,
  font_p: 15,
  breadcrumb_font_size: 15,
};
