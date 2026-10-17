"""Train two small quantile MLPs on real archived weather; export portable weights.

NumPy backpropagation keeps the training environment small and reproducible.
The browser loads these exact dense weights into TensorFlow.js.
"""
import json
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models'
OUT.mkdir(parents=True,exist_ok=True)
FEATURES=['temperature_c','humidity_pct','rain_mm','wind_kmh','antecedent_forecast_rain_7d_mm','hour_sin','hour_cos','season_sin','season_cos','latitude','longitude']
RNG=np.random.default_rng(20261017)
Q=np.array([.1,.5,.9],dtype=np.float32)


def forward(x,layers):
    cache=[x]
    for i,(w,b) in enumerate(layers):
        x=x@w+b
        if i<len(layers)-1:x=np.maximum(x,0)
        cache.append(x)
    return x,cache


def fit(x,y,valx,valy):
    layers=[(RNG.normal(0,np.sqrt(2/a),(a,b)).astype(np.float32),np.zeros(b,dtype=np.float32)) for a,b in [(x.shape[1],64),(64,32),(32,3)]]
    params=[p for layer in layers for p in layer]
    m=[np.zeros_like(p) for p in params];v=[np.zeros_like(p) for p in params]
    best=float('inf');best_layers=None;step=0;stale=0
    for epoch in range(24):
        order=RNG.permutation(len(x));losses=[]
        for start in range(0,len(x),512):
            idx=order[start:start+512];pred,cache=forward(x[idx],layers)
            err=y[idx,None]-pred
            losses.append(float(np.maximum(Q*err,(Q-1)*err).mean()))
            grad=(np.where(err>=0,-Q,1-Q)/(len(idx)*3)).astype(np.float32)
            grads=[]
            for i in range(len(layers)-1,-1,-1):
                grads[0:0]=[cache[i].T@grad,grad.sum(axis=0)]
                if i:grad=(grad@layers[i][0].T)*(cache[i]>0)
            step+=1
            for k,(p,g) in enumerate(zip(params,grads)):
                g=np.clip(g,-5,5);m[k]=.9*m[k]+.1*g;v[k]=.999*v[k]+.001*g*g
                p-=.001*(m[k]/(1-.9**step))/(np.sqrt(v[k]/(1-.999**step))+1e-8)
        pred,_=forward(valx,layers);err=valy[:,None]-pred;loss=float(np.maximum(Q*err,(Q-1)*err).mean())
        print(f'epoch {epoch+1:02d} train={np.mean(losses):.4f} validation={loss:.4f}',flush=True)
        if loss<best-1e-4:best=loss;best_layers=[(w.copy(),b.copy()) for w,b in layers];stale=0
        else:stale+=1
        if stale>=5:break
    return best_layers


def metrics(pred,y,base,threshold):
    err=y[:,None]-pred
    positive=y>=threshold;flag=pred[:,2]>=threshold
    tp=int(np.sum(positive&flag))
    return dict(mae=round(float(np.abs(y-pred[:,1]).mean()),5),baselineMae=round(float(np.abs(y-base).mean()),5),pinball=round(float(np.maximum(Q*err,(Q-1)*err).mean()),5),coverage=round(float(((y>=pred[:,0])&(y<=pred[:,2])).mean()),5),count=len(y),precision=round(tp/max(1,int(flag.sum())),5),recall=round(tp/max(1,int(positive.sum())),5))


def main():
    data=np.load(ROOT/'data/training.npz',allow_pickle=True)
    x,y,b,t,ids=[data[k] for k in ['x','y','baseline','time','site']]
    sites=json.loads((ROOT/'public/data/model-sites.json').read_text())
    held=np.isin(ids,[s['id'] for s in sites if s['heldOut']]);dates=t.astype(str)
    masks=dict(train=(dates<'2025-01-01')&~held,validation=(dates>='2025-01-01')&(dates<'2025-07-01')&~held,calibration=(dates>='2025-07-01')&(dates<'2026-01-01')&~held,test=(dates>='2026-01-01')&~held,unseen=(dates>='2026-01-01')&held)
    mean=x[masks['train']].mean(axis=0);std=x[masks['train']].std(axis=0);std=np.maximum(std,.001)
    xn=(x-mean)/std
    train_idx=np.flatnonzero(masks['train']);train_idx=RNG.choice(train_idx,min(120000,len(train_idx)),replace=False)
    valid_idx=np.flatnonzero(masks['validation'])[::4]
    networks={};predictions={};results={}
    soil_thresholds={};soil_baseline=np.zeros(len(x),dtype=np.float32)
    global_thresholds=np.quantile(y[masks['train'],1],[.5,.9,.95]).tolist()
    for s in sites:
        sm=(ids==s['id']);training=sm&masks['train']
        thresholds=np.quantile(y[training,1],[.5,.9,.95]).tolist() if training.any() else global_thresholds
        soil_thresholds[s['id']]=thresholds
        soil_baseline[sm]=thresholds[0]
    for name,idx,scale,offset,residual in [('heat',0,10.,0.,True),('soil',1,.1,.25,False)]:
        print(f'Training {name}: {len(train_idx)} sampled historical hours',flush=True)
        target=(y[:,idx]-(b if residual else 0)-offset)/scale
        layers=fit(xn[train_idx],target[train_idx],xn[valid_idx],target[valid_idx])
        pred=np.concatenate([forward(xn[start:start+25000],layers)[0] for start in range(0,len(xn),25000)])*scale+offset
        if residual:pred+=b[:,None]
        pred.sort(axis=1)
        cm=masks['calibration'];errors=np.maximum(pred[cm,0]-y[cm,idx],y[cm,idx]-pred[cm,2])
        adjustment=max(0,float(np.quantile(errors,.8)))
        pred[:,0]-=adjustment;pred[:,2]+=adjustment
        if name=='soil':pred=np.clip(pred,0,1)
        base=b if residual else soil_baseline
        thresholds=103 if residual else np.array([soil_thresholds[s][1] for s in ids])
        results[name]=metrics(pred[masks['test']],y[masks['test'],idx],base[masks['test']],thresholds if np.isscalar(thresholds) else thresholds[masks['test']])
        results['unseen'+name.title()]=metrics(pred[masks['unseen']],y[masks['unseen'],idx],base[masks['unseen']],thresholds if np.isscalar(thresholds) else thresholds[masks['unseen']])
        print(name,results[name],flush=True)
        predictions[name]=pred
        networks[name]=dict(layers=[dict(weights=np.round(w,8).tolist(),bias=np.round(bias,8).tolist()) for w,bias in layers],mean=mean.tolist(),std=std.tolist(),targetScale=scale,targetOffset=offset,residual=residual,intervalAdjustment=adjustment)
    bysite={}
    for s in sites:
        sm=(ids==s['id'])&(dates>='2026-01-01')
        bysite[s['id']]={name:metrics(predictions[name][sm],y[sm,idx],(b if name=='heat' else soil_baseline)[sm],103 if name=='heat' else soil_thresholds[s['id']][1]) for name,idx in [('heat',0),('soil',1)]}
    bundle=dict(version='planit-quantile-1',features=FEATURES,source='Archived GFS 48h forecasts → ERA5-Land reanalysis targets',createdAt=datetime.now(timezone.utc).isoformat(),**networks,soilThresholds=soil_thresholds,evaluation=dict(**results,bySite=bysite,counts={k:int(v.sum()) for k,v in masks.items()}|{'sampledTraining':len(train_idx)},notes=['Training: 2024; validation: Jan–Jun 2025; interval calibration: Jul–Dec 2025; untouched test: Jan–Sep 2026.','10 plants excluded from fitting, normalization, and uncertainty calibration.','Heat baseline is the uncorrected 48-hour GFS forecast; soil baseline is training-period site median (global median for unseen plants).','All rainfall features are archived forecast estimates, not observed rainfall. Targets are reanalysis, not on-site measurements.','Intervals calibrated marginally on chronological calibration data; coverage is not guaranteed at every site.']))
    (OUT/'bundle.json').write_text(json.dumps(bundle,separators=(',',':')))
    (OUT/'evaluation.json').write_text(json.dumps(bundle['evaluation'],indent=2))
    # Browser calibration gets disjoint, capped samples, never a hidden test split.
    samples={};forecasts={}
    hero=sites[0]['id'];hm=(ids==hero)&(dates>='2026-07-01')&(dates<'2026-09-01')
    candidates=np.flatnonzero(hm);peak=candidates[np.argmax(predictions['heat'][hm,2])];demo_day=str(t[peak])[:10]
    for s in sites:
        si=np.flatnonzero(ids==s['id']);samples[s['id']]=[]
        def sample(j,split):
            valid=str(t[j]);issued=(np.datetime64(valid[:-1])-np.timedelta64(48,'h')).astype(str)+'Z'
            return dict(time=valid,issuedAt=issued,availableAt=issued,x=np.round(x[j],5).astype(float).tolist(),heat=round(float(y[j,0]),5),soil=round(float(y[j,1]),6),baselineHeat=round(float(b[j]),5),baselineSoil=round(float(soil_baseline[j]),6),split=split)
        for split,limit in [('train',240),('validation',96),('calibration',96),('test',192)]:
            part=si[(dates[si]<'2025-01-01') if split=='train' else ((dates[si]>='2025-01-01')&(dates[si]<'2025-07-01')) if split=='validation' else ((dates[si]>='2025-07-01')&(dates[si]<'2026-01-01')) if split=='calibration' else dates[si]>='2026-01-01']
            chosen=RNG.choice(part,min(limit,len(part)),replace=False);chosen.sort()
            samples[s['id']].extend(sample(j,split) for j in chosen)
        local_start=datetime.fromisoformat(demo_day).replace(tzinfo=ZoneInfo(s['timezone'])).astimezone(timezone.utc)
        start=local_start.strftime('%Y-%m-%dT%H:%M:%SZ')
        end=(np.datetime64(start[:-1])+np.timedelta64(24,'h')).astype(str)+'Z'
        di=si[(dates[si]>=start)&(dates[si]<end)]
        hours=[]
        for j in di:
            row=sample(j,'test');row.pop('split');row.pop('availableAt');row.pop('heat');row.pop('soil');row.pop('baselineSoil')
            row.update(heat=np.round(predictions['heat'][j],5).tolist(),soil=np.round(predictions['soil'][j],6).tolist(),temperature=float(x[j,0]),humidity=float(x[j,1]),precipitation=float(x[j,2]),wind=float(x[j,3]),actualHeat=round(float(y[j,0]),4),actualSoil=round(float(y[j,1]),6))
            hours.append(row)
        forecasts[s['id']]=dict(siteId=s['id'],mode='historical',fetchedAt=demo_day+'T00:00:00Z',modelVersion=bundle['version'],antecedentRain24=round(float(x[si[(dates[si] < start) & (dates[si] >= (np.datetime64(start[:-1])-np.timedelta64(24,'h')).astype(str)+'Z')],2].sum()),3),hours=hours)
    (ROOT/'public/data/samples.json').write_text(json.dumps(samples,separators=(',',':')))
    (ROOT/'public/data/forecasts.json').write_text(json.dumps(forecasts,separators=(',',':')))
    now=(np.datetime64(demo_day+'T21:45:00')-np.timedelta64(1,'D')).astype(str)+'Z'
    (ROOT/'public/data/scenario.json').write_text(json.dumps(dict(now=now,forecastDate=demo_day,heroSiteId=hero,description='Real historical forecasts and reanalysis. Lightning and crew events are demonstration inputs.'),indent=2))
    print('Exported models, samples, and historical scenario',demo_day,flush=True)


if __name__=='__main__':main()
