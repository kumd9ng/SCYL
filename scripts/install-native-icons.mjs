import {copyFile,mkdir,readFile,readdir,unlink,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const android=path.join(root,'android','app','src','main','res');
const ios=path.join(root,'ios','App','App','Assets.xcassets');
const write=async(file,text)=>{await mkdir(path.dirname(file),{recursive:true});await writeFile(file,text);};
const copy=async(source,dest)=>{await mkdir(path.dirname(dest),{recursive:true});await copyFile(source,dest);};
const removeOwned=async(file,allowedRoot)=>{
  const resolved=path.resolve(file),base=path.resolve(allowedRoot)+path.sep;
  if(!resolved.startsWith(base))throw new Error('Refusing native asset operation outside allowed root');
  try{await unlink(resolved);}catch(e){if(e.code!=='ENOENT')throw e;}
};
const densitySizes={mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192};
for(const [density,size] of Object.entries(densitySizes)){
  const source=path.join(root,'assets',`scyl-icon-${size}.png`);
  for(const name of ['ic_launcher.png','ic_launcher_round.png'])await copy(source,path.join(android,`mipmap-${density}`,name));
  await removeOwned(path.join(android,`mipmap-${density}`,'ic_launcher_foreground.png'),android);
}
// Match the source SVG: two concentric circles and one orange indicator.
// The 96-unit symbol fits within the adaptive icon's 66-unit safe circle.
const circlePath=(cx,cy,r)=>`M${cx-r},${cy} a${r},${r} 0,1 0,${r*2},0 a${r},${r} 0,1 0,-${r*2},0 Z`;
const outerCircle=circlePath(48,48,35),innerCircle=circlePath(48,48,13),indicator=circlePath(65.5,17.689,5);
const dialPaths=(strokeColor,indicatorColor)=>`    <path android:pathData="${outerCircle}" android:fillColor="#00000000" android:strokeColor="${strokeColor}" android:strokeWidth="3.5"/>
    <path android:pathData="${innerCircle}" android:fillColor="#00000000" android:strokeColor="${strokeColor}" android:strokeWidth="3.5"/>
    <path android:pathData="${indicator}" android:fillColor="${indicatorColor}"/>`;
const vector=`<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
  <group android:translateX="15.6" android:translateY="15.6" android:scaleX="0.8" android:scaleY="0.8">
${dialPaths('#252724','#e85825')}
  </group>
</vector>
`;
await write(path.join(android,'drawable-v24','ic_launcher_foreground.xml'),vector);
await write(path.join(android,'drawable','ic_launcher_background.xml'),'<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#f4f3ee"/></shape>\n');
await write(path.join(android,'values','ic_launcher_background.xml'),'<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">#f4f3ee</color></resources>\n');
const monochrome=`<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
  <group android:translateX="15.6" android:translateY="15.6" android:scaleX="0.8" android:scaleY="0.8">
${dialPaths('#FFFFFFFF','#FFFFFFFF')}
  </group>
</vector>\n`;
await write(path.join(android,'drawable','scyl_launcher_monochrome.xml'),monochrome);
for(const version of [26,33])for(const name of ['ic_launcher.xml','ic_launcher_round.xml']){
  await write(path.join(android,`mipmap-anydpi-v${version}`,name),`<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background"/>
  <foreground android:drawable="@drawable/ic_launcher_foreground"/>
${version>=33?'  <monochrome android:drawable="@drawable/scyl_launcher_monochrome"/>\n':''}</adaptive-icon>\n`);
}
// Remove only known generated template splash files, then use a centered branded native drawable.
for(const dir of await readdir(android,{withFileTypes:true}))if(dir.isDirectory()&&/^drawable(?:-|$)/.test(dir.name))await removeOwned(path.join(android,dir.name,'splash.png'),android);
await write(path.join(android,'drawable','splash.xml'),'<?xml version="1.0" encoding="utf-8"?>\n<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item android:drawable="@color/ic_launcher_background"/><item android:width="144dp" android:height="144dp" android:gravity="center" android:drawable="@drawable/ic_launcher_foreground"/></layer-list>\n');
const stylesFile=path.join(android,'values','styles.xml');
let styles=await readFile(stylesFile,'utf8');
styles=styles.replace(/<style name="AppTheme.NoActionBarLaunch"[\s\S]*?<\/style>/,`<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/ic_launcher_background</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/ic_launcher_foreground</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:background">@drawable/splash</item>
    </style>`);
await write(stylesFile,styles);
const icon1024=path.join(root,'assets','scyl-icon-1024.png');
await copy(icon1024,path.join(ios,'AppIcon.appiconset','AppIcon-512@2x.png'));
await write(path.join(ios,'AppIcon.appiconset','Contents.json'),JSON.stringify({images:[{filename:'AppIcon-512@2x.png',idiom:'universal',platform:'ios',size:'1024x1024'}],info:{author:'xcode',version:1}},null,2)+'\n');
for(const old of ['splash-2732x2732.png','splash-2732x2732-1.png','splash-2732x2732-2.png'])await removeOwned(path.join(ios,'Splash.imageset',old),ios);
await copy(icon1024,path.join(ios,'Splash.imageset','scyl-splash.png'));
await write(path.join(ios,'Splash.imageset','Contents.json'),JSON.stringify({images:[{filename:'scyl-splash.png',idiom:'universal',scale:'1x'}],info:{author:'xcode',version:1}},null,2)+'\n');
const storyboard=`<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="17132" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="01J-lp-oVM">
  <device id="retina4_7" orientation="portrait" appearance="light"/>
  <dependencies><deployment identifier="iOS"/><plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="17105"/></dependencies>
  <scenes><scene sceneID="EHf-IW-A2E"><objects>
    <viewController id="01J-lp-oVM" sceneMemberID="viewController"><view key="view" id="SCYL-root">
      <rect key="frame" x="0" y="0" width="375" height="667"/><autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES"/>
      <subviews><imageView userInteractionEnabled="NO" contentMode="scaleAspectFit" image="Splash" translatesAutoresizingMaskIntoConstraints="NO" id="SCYL-mark"><rect key="frame" x="107.5" y="253.5" width="160" height="160"/><constraints><constraint firstAttribute="width" constant="160" id="SCYL-width"/><constraint firstAttribute="height" constant="160" id="SCYL-height"/></constraints></imageView></subviews>
      <color key="backgroundColor" red="0.9568627451" green="0.9529411765" blue="0.9333333333" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
      <constraints><constraint firstItem="SCYL-mark" firstAttribute="centerX" secondItem="SCYL-root" secondAttribute="centerX" id="SCYL-center-x"/><constraint firstItem="SCYL-mark" firstAttribute="centerY" secondItem="SCYL-root" secondAttribute="centerY" id="SCYL-center-y"/></constraints>
    </view></viewController><placeholder placeholderIdentifier="IBFirstResponder" id="iYj-Kq-Ea1" userLabel="First Responder" sceneMemberID="firstResponder"/>
  </objects></scene></scenes><resources><image name="Splash" width="1024" height="1024"/></resources>
</document>\n`;
await write(path.join(root,'ios','App','App','Base.lproj','LaunchScreen.storyboard'),storyboard);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const [density,size] of Object.entries(densitySizes)){
  const expected=sha(await readFile(path.join(root,'assets',`scyl-icon-${size}.png`)));
  for(const name of ['ic_launcher.png','ic_launcher_round.png'])if(sha(await readFile(path.join(android,`mipmap-${density}`,name)))!==expected)throw Error('Android icon copy mismatch');
}
if(sha(await readFile(icon1024))!==sha(await readFile(path.join(ios,'AppIcon.appiconset','AppIcon-512@2x.png'))))throw Error('iOS icon copy mismatch');
if(sha(await readFile(icon1024))!==sha(await readFile(path.join(ios,'Splash.imageset','scyl-splash.png'))))throw Error('iOS splash copy mismatch');
console.log('SCYL icons installed: 10 Android legacy PNGs, circular adaptive vector with orange indicator, themed monochrome, iOS 1024 PNG, off-white launch screens. All 12 PNG copy hashes verified.');
