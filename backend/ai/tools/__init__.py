from .browser_tools import (
    browser_click,
    browser_type,
    browser_key_press,
    browser_navigate,
    browser_list_tabs,
    browser_new_tab,
    browser_close_tab,
    browser_select_tab,
)
from .snapshot_tool import snapshot_page


def get_all_tools():
    return [
        browser_click,
        browser_type,
        browser_key_press,
        browser_navigate,
        browser_list_tabs,
        browser_new_tab,
        browser_close_tab,
        browser_select_tab,
        snapshot_page,
    ]


__all__ = [
    "get_all_tools",
    "browser_click",
    "browser_type",
    "browser_key_press",
    "browser_navigate",
    "browser_list_tabs",
    "browser_new_tab",
    "browser_close_tab",
    "browser_select_tab",
    "snapshot_page",
]

