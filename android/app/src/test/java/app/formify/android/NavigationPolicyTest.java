package app.formify.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class NavigationPolicyTest {
    @Test public void acceptsOnlyTheHttpsFormifyOrigin() {
        assertTrue(NavigationPolicy.isInternal("https://getformify.pages.dev/"));
        assertTrue(NavigationPolicy.isInternal("https://getformify.pages.dev/visit.html#token"));
        assertTrue(NavigationPolicy.isInternal("https://getformify.pages.dev:443/?theme=blue#you"));
        assertFalse(NavigationPolicy.isInternal("http://getformify.pages.dev/"));
        assertFalse(NavigationPolicy.isInternal("https://getformify.pages.dev.evil.example/"));
        assertFalse(NavigationPolicy.isInternal("https://getformify.pages.dev@evil.example/"));
        assertFalse(NavigationPolicy.isInternal("https://evil.example@getformify.pages.dev/"));
        assertFalse(NavigationPolicy.isInternal("https://getformify.pages.dev:8080/"));
        assertFalse(NavigationPolicy.isInternal(null));
        assertFalse(NavigationPolicy.isInternal("%%%"));
    }

    @Test public void blocksExecutableAndPrivateSchemes() {
        for (String url : new String[]{"javascript:alert(1)", "file:///data/data/private", "content://private",
                "intent://anything", "data:text/html,test", "blob:https://getformify.pages.dev/id", "#you", "%%%"}) {
            assertFalse(url, NavigationPolicy.isExternal(url));
        }
        for (String url : new String[]{"https://example.com", "mailto:hello@example.com", "tel:5551234", "geo:0,0?q=clinic"}) {
            assertTrue(url, NavigationPolicy.isExternal(url));
        }
    }
}
