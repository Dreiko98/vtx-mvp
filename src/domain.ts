import { z } from 'zod';

export const sports = ['Trail running','Road running','Triathlon','Cycling','Swimming','Ultra trail','Climbing'] as const;
export const offerTypes = ['Ambassador','Product','Content','Event','Sponsorship'] as const;
export const values = ['Sustainability','Community','Performance',"Women’s sport",'Adventure','Inclusion'];
const text = z.string().trim().min(1).max(300);
const long = z.string().trim().min(1).max(6000);
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s, 'Use a valid date');
export const url = z.string().trim().max(1000).refine(v => !v || /^https?:\/\//i.test(v) && URL.canParse(v), 'Use an http or https URL');
export const profileSchema = z.object({
 headline: text, location: text, region: text, bio: long, sports: z.array(text).min(1).max(12), values: z.array(text).min(1).max(12),
 website: url, contact: text, availability: text, lookingFor: z.array(text).min(1).max(8),
 socials: z.array(z.object({network:text,handle:text,url,followers:z.number().int().min(0).max(1e9),engagement:z.number().min(0).max(100)})).max(8),
 audience: z.string().max(1000), training: z.string().max(1500),
 competitions: z.array(z.object({year:z.number().int().min(1950).max(2100),name:text,result:text,url})).max(40),
 experience: z.array(z.object({name:text,role:text,period:text,description:z.string().max(2000)})).max(20),
 sector: z.string().max(300), teamSize: z.string().max(100), level: z.string().max(100)
});
export type Profile = z.infer<typeof profileSchema>;
export interface Person {id:string;name:string;role:'athlete'|'brand';profile:Profile;saved?:boolean;views?:number}
export interface User extends Person {email:string}
export const offerSchema = z.object({title:text,description:long,sport:z.enum([...sports,'Any endurance']),region:text,values:z.array(text).min(1).max(12),type:z.enum(offerTypes),budget:z.number().min(0).max(1e8),deadline:date,startDate:date,endDate:date,deliverables:long,status:z.enum(['draft','published','closed'])}).refine(v=>v.startDate<=v.endDate,{message:'End date must follow start date',path:['endDate']}).refine(v=>v.deadline<=v.endDate,{message:'Deadline must be before the end date',path:['deadline']});
export type OfferInput = z.infer<typeof offerSchema>;
export interface Offer extends OfferInput {id:string;brandId:string;brandName:string;brandProfile:Profile;createdAt:string;applicationCount:number;myApplicationId?:string;myStatus?:string;match?:Match}
export interface Match {score:number;factors:{label:string;points:number;maximum:number;reason:string}[];source:string}
export function compatibility(profile:Profile, offer:Pick<Offer,'sport'|'region'|'values'|'type'>):Match {
 const sport = offer.sport==='Any endurance'||profile.sports.includes(offer.sport);
 const region = offer.region.toLowerCase()==='anywhere'||profile.region.toLowerCase()===offer.region.toLowerCase();
 const shared=offer.values.filter(v=>profile.values.includes(v));
 const preferred=profile.lookingFor.includes(offer.type);
 const factors=[{label:'Sport',points:sport?40:0,maximum:40,reason:sport?'Discipline matches the brief.':'This discipline is not in the athlete profile.'},
 {label:'Region',points:region?25:0,maximum:25,reason:region?'Region matches the brief.':'The athlete is based in a different region.'},
 {label:'Shared values',points:Math.round(20*shared.length/Math.max(1,offer.values.length)),maximum:20,reason:shared.length?shared.join(' · '):'No shared values declared.'},
 {label:'Collaboration type',points:preferred?15:0,maximum:15,reason:preferred?'This is a preferred collaboration type.':'This type is not a declared preference.'}];
 return {score:factors.reduce((s,f)=>s+f.points,0),factors,source:'Rule-based fit · declared synthetic profiles · not a VTX Index or a performance prediction'};
}
export const statusLabels:Record<string,string>={submitted:'Submitted',reviewing:'In review',shortlisted:'Shortlisted',negotiating:'Negotiating',proposed:'Proposal sent',accepted:'Accepted',rejected:'Rejected',withdrawn:'Withdrawn',pending:'Pending',active:'Active',completed:'Completed',published:'Published',draft:'Draft',closed:'Closed',approved:'Approved',changes_requested:'Changes requested'};
