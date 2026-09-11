export interface PostTemplateSettings {
  whatsapp_banner: boolean;
  share_buttons: boolean;
  author_box: boolean;
  related_posts: boolean;
  comments_section: boolean;
  sidebar: boolean;
  sidebar_whatsapp: boolean;
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
}

export const POST_TEMPLATE_DEFAULTS: PostTemplateSettings = {
  whatsapp_banner: true,
  share_buttons: true,
  author_box: true,
  related_posts: true,
  comments_section: true,
  sidebar: true,
  sidebar_whatsapp: true,
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
};
