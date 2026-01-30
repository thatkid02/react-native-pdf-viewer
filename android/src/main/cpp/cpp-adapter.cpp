#include <jni.h>
#include "pdfviewerOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return margelo::nitro::pdfviewer::initialize(vm);
}
