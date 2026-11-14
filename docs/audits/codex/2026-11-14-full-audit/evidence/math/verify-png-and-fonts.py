import base64,hashlib,json,sys
from pathlib import Path
from collections import Counter
from PIL import Image,ImageDraw,ImageFont
sys.stdout.reconfigure(encoding='utf-8')
root=Path(sys.argv[1]);out=Path(sys.argv[2]);manifest=json.loads((root/'public/samples/manifest.json').read_text(encoding='utf-8'))
rows=[]
for sample in manifest['samples']:
    path=root/'public'/sample['file']
    with Image.open(path) as image: image.verify()
    with Image.open(path) as image:
        image.load();raw=image.convert('L').tobytes()
        rows.append({'id':sample['id'],'label':sample['label'],'split':sample['split'],'size':list(image.size),'mode':image.mode,'pixelMatchManifest':raw==base64.b64decode(sample['pixels']),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'pixelSha256':hashlib.sha256(raw).hexdigest(),'range':[min(raw),max(raw)]})
result={'pngCount':len(list((root/'public/samples').glob('*.png'))),'records':len(rows),'allVerified':True,'all16x16':all(r['size']==[16,16] for r in rows),'allGrayscale':all(r['mode']=='L' for r in rows),'allPixelsMatchManifest':all(r['pixelMatchManifest'] for r in rows),'uniquePixels':len({r['pixelSha256'] for r in rows}),'labels':dict(Counter(str(r['label']) for r in rows)),'splits':dict(Counter(r['split'] for r in rows)),'files':rows}
(out/'png-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
fontpaths=['arial.ttf','times.ttf','comic.ttf','segoeui.ttf'];fonts=[];samples=[];(out/'novel-fonts').mkdir(exist_ok=True)
for filename in fontpaths:
    p=Path('C:/Windows/Fonts')/filename
    if not p.exists():continue
    font=ImageFont.truetype(str(p),52)
    fonts.append({'name':filename,'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'size':52})
    for label in range(10):
        image=Image.new('L',(64,64),0);draw=ImageDraw.Draw(image);box=draw.textbbox((0,0),str(label),font=font);x=(64-(box[2]-box[0]))/2-box[0];y=(64-(box[3]-box[1]))/2-box[1];draw.text((x,y),str(label),font=font,fill=255)
        identifier=filename.replace('.ttf','')+'-'+str(label)
        image.save(out/'novel-fonts'/(identifier+'.png'))
        samples.append({'id':identifier,'font':filename,'label':label,'width':64,'height':64,'pixels':base64.b64encode(image.tobytes()).decode('ascii')})
(out/'novel-fonts.json').write_text(json.dumps({'kind':'new synthetic font glyphs; not a handwriting benchmark','fonts':fonts,'samples':samples},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({**{k:v for k,v in result.items() if k!='files'},'novelFontCount':len(fonts),'novelGlyphCount':len(samples)},ensure_ascii=False,indent=2))
