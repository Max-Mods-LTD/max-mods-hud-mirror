#!/usr/bin/env python3
"""Generate a native iDrive 7 list page and its source-only Store package."""
import json
import pathlib
import shutil
import uuid
import textwrap
from xml.sax.saxutils import escape
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
CAR = ROOT / 'car'
APP = 'maxmods_hud_mirror'
RELEASES = json.loads((ROOT / 'release_notes.json').read_text())['releases']
RELEASE = RELEASES[0]
GUIDE = json.loads((ROOT / 'connection_guide.json').read_text())
assert all(len(p['lines'])<=4 and all(len(line)<=70 for line in p['lines']) for p in GUIDE['pages'])
VERSION = RELEASE['version']
TREE = CAR / (APP + '@' + VERSION)
NS = uuid.UUID('61e3f454-5dc3-4c41-8f08-e5d94750f4cd')

def write(p, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, indent=2) + '\n')

def uid(name):
    return str(uuid.uuid5(NS, name))

release_lines = [textwrap.wrap(change, width=60, break_long_words=False, break_on_hyphens=False) for change in RELEASE['changes']]
assert all(0 < len(lines) <= 2 for lines in release_lines), 'Keep each release note within two 60-character lines'
generated_notes = {'version': VERSION, 'phoneVersion': RELEASE['phoneVersion'], 'changes': RELEASE['changes'], 'lines': release_lines}
(CAR / 'src' / 'release_notes.js').write_text('// SPDX-License-Identifier: GPL-3.0-or-later\n// Generated from release_notes.json.\n\'use strict\';\nmodule.exports = ' + json.dumps(generated_notes, indent=2) + ';\n')
(CAR / 'src' / 'connection_guide.js').write_text('// SPDX-License-Identifier: GPL-3.0-or-later\n// Generated from connection_guide.json.\n\'use strict\';\nmodule.exports = ' + json.dumps(GUIDE, indent=2) + ';\n')
# BMW owns the menu layout, type, red selection highlight and rotary focus.
# Only the picture page embeds video; no painted menu or controller grab.
pages = [
    (1, 'ST_MaxModsHudMirror', 'Max Mods HUD Mirror', 'LT_State_Wide', [
        (20,'mirrorStatus','Stopped','label'),(21,'mirrorPark','Waiting for vehicle signals','label'),
        (22,'mirrorPhone','Start sharing on the phone','label'),
        (32,'mirrorStart','Start mirror'),(33,'mirrorStop','Stop mirror'),(31,'mirrorPair','Pair phone'),
        (45,'mirrorView','View iDrive picture'),(46,'mirrorSettings','Settings')]),
    (2, 'ST_MaxModsVideo', 'Max Mods phone picture', 'LT_State_A4A_WelcomeApp', [
        (1400,'videoBack','Back to menu'),(1401,'videoStop','Stop mirror')]),
    (3, 'ST_MaxModsDisplayPicker', 'Display destination', 'LT_State_Wide', [
        (1500,'pickHud','Head-up display'),(1501,'pickCluster','Instrument cluster'),(1502,'pickIdrive','iDrive screen')]),
    (4, 'ST_MaxModsLayoutPicker', 'Picture size', 'LT_State_Wide', [
        (1510,'pickCompact','Compact - reserve BMW information space'),(1511,'pickFull','Full display - keep complete phone picture')]),
    (5, 'ST_MaxModsSettingsPicker', 'Video and background options', 'LT_State_Wide', [
        (1520,'pickAutoGpu','Automatic GPU video'),(1521,'pickJpeg','JPEG compatibility mode'),
        (1522,'pickBackground','Mirror on other pages'),(1525,'pickProfile','Phone profile: select Smooth for 60 fps','label'),
        (1523,'pickForget','Forget linked phone'),(1524,'pickDiagnostics','Connection diagnostics'),(1526,'settingsBack','Back')]),
    (6, 'ST_MaxModsDiagnostics', 'Connection diagnostics', 'LT_State_Wide', [
        (1600,'diagOutput','Output','label'),(1601,'diagRate','Received fps','label'),
        (1602,'diagPhone','Phone','label'),(1603,'diagCapture','Capture','label'),
        (1611,'diagPhoneRate','Phone capture / sent fps','label'),(1612,'diagTraffic','Phone video traffic','label'),
        (1604,'diagSpeed','Speed freshness','label'),(1605,'diagPark','Park freshness','label'),
        (1606,'diagIssue','Last issue','label'),(1607,'diagIssue2','','label'),
        (1608,'diagSignals','Signal provider','label'),(1609,'diagReconnect','Reconnect linked phone'),(1610,'diagBack','Back')]),
    (7, 'ST_MaxModsConnectionGuide', 'Connection guide', 'LT_State_Wide', [
        (1700,'guideTitle','Connection guide','label')]+[(1701+i,'guideLine'+str(i+1),'','label') for i in range(4)]+
        [(1710,'guidePrevious','Previous step'),(1711,'guideNext','Next step'),(1712,'guideBack','Back')]),
    (8, 'ST_MaxModsDisplaySettings', 'Display settings', 'LT_State_Wide', [
        (1800,'displayTarget','Destination'),(1801,'mirrorLayout','Picture size'),
        (1802,'displayTest','Test selected display (8 seconds)'),(1803,'displayBack','Back')]),
    (9, 'ST_MaxModsUpdates', 'Update notes', 'LT_State_Wide', [
        (40,'mirrorWhatsNew',"What is new in "+VERSION,'label'),(41,'mirrorReleaseLine1',release_lines[0][0],'label'),
        (42,'mirrorReleaseLine2',release_lines[0][1] if len(release_lines[0])>1 else '','label'),
        (43,'mirrorReleasePrevious','Previous change'),(44,'mirrorReleaseNext','Next change'),(1900,'updatesBack','Back')]),
    (11, 'ST_MaxModsSettingsHub', 'Settings', 'LT_State_Wide', [
        (35,'mirrorTarget','Display settings'),(48,'settingsVideo','Video and background'),
        (49,'settingsPair','Pair or change phone'),(51,'settingsManual','Manual pairing'),(37,'mirrorGuide','Connection guide'),
        (39,'mirrorDiagnostics','Connection diagnostics'),(47,'mirrorUpdates','What is new'),
        (30,'mirrorTest','Test selected display'),(38,'mirrorForceClose','Force close / reset app'),
        (23,'mirrorVersion','Car '+VERSION+' / phone '+RELEASE['phoneVersion'],'label'),(50,'hubBack','Back')])
]
containers = {}
xml = ['<?xml version="1.0" encoding="UTF-8"?>','<application>']
for sid,name,title,widget,controls in pages:
    title_id=10 if sid==1 else 110+sid
    state_components={str(title_id): {'type':'title','name':name+'Title','properties':{'Visible':{'value':1,'type':'UInt'}},'rows':[{'Text':{'value':title,'type':'Text'}}]}}
    xml += [f'  <container id="{sid}" type="state" widget="{widget}">']
    if sid!=1: xml.append('    <property id="9" value="1"/>') # BMW secondary page / Back navigation.
    xml += [f'    <layoutGroup id="{500+sid*10}" name="Titlebar"><component id="{title_id}" type="title"><property id="2" value="1"/></component></layoutGroup>',
            f'    <layoutGroup id="{501+sid*10}" name="List"><property id="3" value="1"/>']
    for row in controls:
        ident,control,label=row[:3];kind=row[3] if len(row)>3 else 'button';focus=3 if kind=='button' else 0
        row_widget='LT_Button_1Row' if kind=='button' else 'LT_Label_1Row'
        xml.append(f'      <component id="{ident}" type="{kind}" widget="{row_widget}"><property id="2" value="1"/><property id="3" value="{focus}"/></component>')
        state_components[str(ident)]={'type':kind,'name':control,'properties':{'Visible':{'value':1,'type':'UInt'},'Focusable':{'value':focus,'type':'UInt'}},'rows':[{'Text':{'value':label,'type':'Text'}}]}
    xml += ['    </layoutGroup>','  </container>']
    containers[str(sid)]={'type':'state','name':name,'components':state_components}
xml.append('</application>')
ui = TREE / 'rhmiData' / 'uiDescriptions' / 'ID7'
ui.mkdir(parents=True, exist_ok=True)
(ui / 'application.xml').write_text('\n'.join(xml) + '\n')
write(ui / 'uiDescription.json', {'schemaVersion':'1.3.0','containers':containers})
write(TREE / 'rhmiData' / 'application.json', {'schemaVersion': '1.3.0', 'application': {
    'uuid': uid('application'), 'type': 'OnlineApp', 'name': APP, 'vendor': 'Max Mods', 'version': VERSION,
    'defaultLanguage': 'en_GB', 'stringBundleUuid': uid('strings'), 'resourceBundleUuid': uid('resources'),
    'uiDescriptions': [{'applicationFilePath': './uiDescriptions/ID7/application.xml', 'uiDescriptionFilePath': './uiDescriptions/ID7/uiDescription.json', 'hmi': ['ID7']}],
    'variantGroups': [{'stringsPath': './variantGroups/Common/texts', 'resourcesPath': './variantGroups/Common/images', 'hmi': ['ID7'], 'brands': ['BMW']}],
    'entryPoints': [{'name': APP, 'uuid': uid('entry'), 'textId': 'SID_HUD_TITLE', 'icon': 'hud_mirror.png',
                     'insertionStateId': 20974, 'insertionFocusId': 2, 'insertionMode': 'INSERT_BELOW', 'insertionOrder': 0,
                     'insertionPriority': 0, 'previewType': 'NONE', 'bookmarkable': True, 'private': False,
                     'appearance': 'DEFAULT', 'isGroupHeader': False, 'insertionGroup': 0}]
}})
languages = ['ar_AE','cs_CZ','da_DK','de_DE','el_GR','en_GB','en_US','es_ES','fi_FI','fr_FR','he_IL','hr_HR','hu_HU','id_ID','it_IT','ja_JP','ko_KR','nb_NO','nl_NL','no_NO','pl_PL','pt_BR','pt_PT','ro_RO','ru_RU','sk_SK','sl_SI','sv_SE','th_TH','tr_TR','uk_UA','vi_VN','zh_CN','zh_TW']
for lang in languages:
    write(TREE / 'rhmiData' / 'variantGroups' / 'Common' / 'texts' / (lang + '.json'), {'SID_HUD_TITLE': 'Max Mods HUD Mirror'})
write(TREE / 'package.json', {'name': APP, 'version': VERSION, 'description': 'Android screen mirroring to one iDrive 7 display: HUD, instrument cluster or iDrive screen, while stationary in Park',
    'main': 'javascript/runner.js', 'author': 'Max Mods', 'license': 'GPL-3.0-or-later', 'mguLocalOnly': True,
    'mguHmi': ['ID7'], 'mguInternet': True,
    'engines': {'node': '>=8.7.0'}, 'dependencies': {'oap-sdk': '24.10.2'},
    'oapAppSettings': {'maxDiskUsage': 10485760, 'cpuLimit': 60, 'memoryThresholdKB': 196608, 'priority': 'PRIO_MEDIUM',
        'visibility': 'FOREGROUND', 'latencyClass': 'FOREGROUND', 'loggingId': 'MMHM', 'userLoginRequired': False,
        'backgroundPriority': 150, 'someipManifest': 'manifest.json'},
    'files': ['config','rhmiData','package.json','npm-shrinkwrap.json','permissions.json','javascript','manifest.json','assets','LICENSE','THIRD_PARTY_NOTICES.md']})
write(TREE / 'npm-shrinkwrap.json', {'name': APP, 'version': VERSION, 'lockfileVersion': 1, 'requires': True, 'dependencies': {}})
write(TREE / 'config' / 'base.json', {'rhmiLoadingEnabled': True, 'entryPointLoadingEnabled': True})

proxies = {x: '*' for x in [
    'de.bmw.infotainment.telematic.oapcontroller.OAPController',
    'de.bmw.infotainment.hmi.remote.RemoteHmi', 'de.bmw.infotainment.hmi.remote.RemoteHmiApplication',
    'de.bmw.infotainment.hmi.entrypoint.EntryPoint','de.bmw.infotainment.hmi.entrypoint.EntryPointManager',
    'de.bmw.infotainment.hmi.resourcemanagement.ResourceManager','de.bmw.infotainment.hmi.resourcemanagement.ResourceBundle',
    'de.bmw.infotainment.hmi.resourcemanagement.StringBundle',
    'de.bmw.infotainment.hmi.usecasemanagement.UseCaseInstance', 'de.bmw.infotainment.hmi.usecasemanagement.UseCaseProvider']}
proxies.update({
    'de.bmw.infotainment.hmi.usecasemanagement.UseCaseRegistry': {'attributes': {'useCaseIds': 'r'}, 'broadcasts': ['registryUpdate'], 'instances': '*', 'methods': ['getProvider']},
    'de.bmw.infotainment.telematic.oap.PrivateEntryPoint': {'instances': ['${userId}'], 'methods': ['registerEntryPoint','unregisterEntryPoint','setSelected','setAvailability']},
    'de.bmw.infotainment.telematic.oap.AppBookmarks': {'instances': ['${userId}'], 'methods': ['registerBookmark']},
    'de.bmw.infotainment.telematic.oap.WakeUpOnDemand': {'instances': ['${userId}'], 'methods': ['registerParticipant','unregisterParticipant']},
    'de.bmw.infotainment.telematic.oap.WodControl': {'instances': '${userId}', 'methods': ['offerService','stopOfferingService']},
    'de.bmw.infotainment.telematic.provisioning.Provisioning': {'instances': '1','broadcasts': ['provisioningDataJSON'],'methods': ['getValueJSON','setFilterForProvisioningData']},
    'de.bmw.infotainment.vehicle.Vehicle': '*', 'de.bmw.infrastructure.EnvironmentalInformation': '*',
    'de.bmw.infotainment.certification.Certification': '*',
    'de.bmw.infotainment.vehicle.Vehicle2': {'instances': '1', 'attributes': {'statusCarSpeed2': 'rs'}},
    # Gear fields have notifications, but no getter in BMW's catalog.
    'de.bmw.infrastructure.VehicleInformation': {'instances': '1', 'attributes': {'statusGearboxDrive': 's','DataPowerTrain2': 's','DataPowerTrain2CRC':'s'}}
})
write(TREE / 'manifest.json', {'proxies': proxies, 'services': {'de.bmw.infotainment.telematic.oap.AppStatus': {'instances': ['${userId}']}}})
# The Store completes framework ACLs from manifest.json at install time.
write(TREE / 'permissions.json', {x: [] for x in ['masterAccessTable','mediatorAccessTable','ownerAccessTable','masterRegistrationTable','mediatorRegistrationTable','ownerRegistrationTable','domainRoleTable']})
modules = ['app.js','speller.js','park_guard.js','vehicle_signals.js','phone_client.js','phone_discovery.js','stream_decoder.js','mirror_controller.js','release_notes.js','connection_guide.js','cluster_render_client.js','jpeg_worker.js','native_video.js','mgu_render_client.js','idrive_renderer.js','gpu_video_renderer.js','saved_phone.js']
write(CAR / 'mgu-app.json', {'schema': 1, 'id': APP, 'version': VERSION, 'tree': TREE.name, 'internet': True,
    'modules': ['src/' + x for x in modules], 'sdk': ['oap-sdk/src/core/OnlineApp.js','oap-sdk/src/logging/logging','oap-sdk/src/someip/someipBuilders']})
write(ROOT / 'mgu-repo.json', {'schema': 1, 'name': 'MaxModsIdriveApps', 'title': 'Max Mods iDrive Apps', 'components': [{'id': APP,'kind': 'app','path': 'car','build': 'unit', 'title': 'Max Mods HUD Mirror',
    'description': 'Phone mirroring with native BMW menus, one HUD/cluster/iDrive destination, six-digit pairing, full-screen viewing and a built-in setup guide.', 'version': VERSION, 'mguHmi': ['ID7'],
    'requires': {'cluster-render': '0.3.7','mgu-render': '0.2.0','mgu-deploy': '0.7.11','maxmods-video':'0.1.0'}},
    # Repo-tree tools are already programs/files. The updater rejects any
    # build field on a tool; only the app uses build='unit'.
    dict(json.loads((ROOT / 'tools/Display60/component.json').read_text()), path='tools/Display60'),
    dict(json.loads((ROOT / 'tools/Video/component.json').read_text()), path='tools/Video')]})
image = Image.new('RGBA', (140, 140), (0,0,0,0))
logo = Image.open(ROOT / 'assets' / 'max-mods-logo-stacked.png').convert('RGBA')
logo.thumbnail((130,80), Image.Resampling.LANCZOS)
image.alpha_composite(logo, ((140-logo.width)//2, 18))
draw = ImageDraw.Draw(image)
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12)
draw.text((34,112), 'HUD Mirror', font=font, fill='white')
icon = TREE / 'rhmiData' / 'variantGroups' / 'Common' / 'images' / 'hud_mirror.png'
icon.parent.mkdir(parents=True, exist_ok=True); image.save(icon)
phone_icon = ROOT / 'android/app/src/main/res/drawable/maxmods_icon.png'
phone_icon.parent.mkdir(parents=True, exist_ok=True); shutil.copy(icon, phone_icon)
shutil.copytree(CAR / 'assets', TREE / 'assets', dirs_exist_ok=True)
shutil.copy(ROOT / 'assets' / 'DejaVu-LICENSE.txt', TREE / 'assets' / 'DejaVu-LICENSE.txt')
# A car-only hotfix keeps the already-published phone APK/source unchanged.
if RELEASE['phoneVersion'] == VERSION:
    shutil.copy(ROOT / 'release_notes.json', ROOT / 'android/app/src/main/assets/release_notes.json')
shutil.copy(ROOT / 'connection_guide.json', ROOT / 'android/app/src/main/assets/connection_guide.json')
shutil.copy(ROOT / 'LICENSE', TREE / 'LICENSE')
if (ROOT / 'THIRD_PARTY_NOTICES.md').exists(): shutil.copy(ROOT / 'THIRD_PARTY_NOTICES.md', TREE / 'THIRD_PARTY_NOTICES.md')
print('Generated', TREE)
