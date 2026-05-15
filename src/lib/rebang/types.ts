export interface RebangTabChild {
  id: number;
  key: string;
  name: string;
  avatar: string;
  avatar_dark: string;
  is_vip_tab: number;
  current_show: boolean;
  child: RebangTabChild[] | null;
}

export interface RebangTab {
  id: number;
  key: string;
  name: string;
  avatar: string;
  avatar_dark: string;
  is_vip_tab: number;
  current_show: boolean;
  child: RebangTabChild[] | null;
}

export interface RebangMenu {
  id: number;
  menu_name: string;
  menu_key: string;
  menu_path: string;
  tab_info: RebangTab[];
}

export interface RebangHotItem {
  item_key: string;
  title: string;
  describe: string;
  image: string;
  heat_str: string;
  label_str: string;
  www_url: string;
}

export interface RebangItemsData {
  last_list_time: number;
  next_refresh_time: number;
  version: number;
  current_page: number;
  total_page: number;
  list: RebangHotItem[];
}

export interface RebangApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}
