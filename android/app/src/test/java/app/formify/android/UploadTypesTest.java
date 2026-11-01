package app.formify.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class UploadTypesTest {
    @Test public void documentImportAllowsPdfOfficeAndImages() {
        String[] types = UploadTypes.mimeTypes(new String[]{".pdf,.docx,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.xlsx,.odt"});
        assertEquals(10, types.length);
        assertEquals("application/pdf", types[0]);
        assertEquals("application/vnd.openxmlformats-officedocument.wordprocessingml.document", types[1]);
        assertFalse(UploadTypes.imagesOnly(types));
    }

    @Test public void cameraIsOfferedOnlyForImageInputs() {
        assertTrue(UploadTypes.imagesOnly(UploadTypes.mimeTypes(new String[]{"image/*"})));
        assertTrue(UploadTypes.imagesOnly(UploadTypes.mimeTypes(new String[]{".PNG", ".jpg"})));
        assertFalse(UploadTypes.imagesOnly(UploadTypes.mimeTypes(new String[]{".pdf"})));
        assertFalse(UploadTypes.imagesOnly(UploadTypes.mimeTypes(null)));
    }

    @Test public void filtersAreNormalizedAndUnknownInputsRemainSelectable() {
        assertArrayEquals(new String[]{"image/jpeg", "application/pdf"}, UploadTypes.mimeTypes(new String[]{" .JPG, .jpeg ", "application/pdf", "not-a-mime"}));
        assertArrayEquals(new String[]{"*/*"}, UploadTypes.mimeTypes(new String[]{""}));
    }
}
