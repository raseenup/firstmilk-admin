from PIL import Image, ImageOps, ImageDraw, ImageFont
from pathlib import Path
import os, io, urllib.request, shutil
url=os.environ["FMV_BRAND_SOURCE"]
req=urllib.request.Request(url,headers={"User-Agent":"FMVOfficialBrandImport/1.0"})
with urllib.request.urlopen(req,timeout=40) as response: data=response.read(2_000_000)
source=Image.open(io.BytesIO(data)).convert("RGBA")
if source.width<180 or source.height<180: raise ValueError("Unexpected logo dimensions")
brand=Path("assets/brand");brand.mkdir(parents=True,exist_ok=True)
source.save(brand/"fmv-logo.png",optimize=True)
source.save(brand/"fmv-logo.webp","WEBP",quality=85,method=4)
scale_x,scale_y=source.width/1254,source.height/1254
crop=source.crop(tuple(round(v*scale) for v,scale in zip((60,120,1190,880),(scale_x,scale_y,scale_x,scale_y))))
crop.thumbnail((180,180),Image.Resampling.LANCZOS)
icon=Image.new("RGBA",(192,192),(0,0,0,0))
icon.alpha_composite(crop,((192-crop.width)//2,(192-crop.height)//2))
icon.save(brand/"fmv-icon.webp","WEBP",quality=85,method=4)
icon.save(brand/"fmv-icon.png",optimize=True)
for side in (32,192,180):
    resized=icon.resize((side,side),Image.Resampling.LANCZOS)
    renamed={32:"favicon-32.png",192:"pwa-icon-192.png",180:"apple-touch-icon.png"}[side]
    resized.save(brand/renamed,optimize=True)
icon.resize((64,64),Image.Resampling.LANCZOS).save(brand/"favicon.ico",format="ICO",sizes=[(16,16),(32,32),(48,48),(64,64)])
card=Image.new("RGB",(1200,630),"#fbfdf9");draw=ImageDraw.Draw(card)
draw.rounded_rectangle((48,48,1152,582),radius=42,fill="#ebf8ef")
image=source.copy();image.thumbnail((485,485),Image.Resampling.LANCZOS)
card.paste(image,(70+(490-image.width)//2,65+(500-image.height)//2),image)
font="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
regular="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
draw.text((575,207),"First Milk",font=ImageFont.truetype(font,57),fill="#05335b")
draw.text((575,282),"Venture",font=ImageFont.truetype(font,67),fill="#076e3d")
draw.text((578,395),"Fresher days, every day.",font=ImageFont.truetype(regular,24),fill="#375e4c")
card.save(brand/"fmv-social-preview.png",optimize=True)
if os.environ.get("GITHUB_REPOSITORY","").endswith("/firstmilk-customer"):
    web=Path("website/assets/brand");web.mkdir(parents=True,exist_ok=True)
    for filename in ["fmv-logo.png","fmv-logo.webp","fmv-icon.webp","fmv-icon.png","favicon.ico","favicon-32.png","apple-touch-icon.png","pwa-icon-192.png","fmv-social-preview.png"]:
        shutil.copy2(brand/filename,web/filename)
print("Official logo assets generated from exact uploaded image source",source.size)

