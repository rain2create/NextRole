import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import { dataPath } from "../config";
import { UserFacingError } from "../ai";
export const settingsSchema=z.object({host:z.string().trim().min(1).max(200).regex(/^[a-zA-Z0-9.-]+$/),port:z.union([z.literal(465),z.literal(587)]),user:z.string().email(),pass:z.string().min(1).max(1000),from:z.string().email()}).strict();
export type MailSettings=z.infer<typeof settingsSchema>;
export async function getMailSettings():Promise<MailSettings|null>{
  try{return settingsSchema.parse(JSON.parse(await fs.readFile(dataPath('mail-settings.json'),'utf8')));}catch{}
  const e=process.env;
  const result=settingsSchema.safeParse({host:e.SMTP_HOST,port:Number(e.SMTP_PORT||587),user:e.SMTP_USER,pass:e.SMTP_PASS,from:e.SMTP_FROM});
  return result.success?result.data:null;
}
export function mailTransport(s:MailSettings){return nodemailer.createTransport({host:s.host,port:s.port,secure:s.port===465,requireTLS:true,auth:{user:s.user,pass:s.pass},connectionTimeout:20000,greetingTimeout:20000,socketTimeout:30000,disableFileAccess:true,disableUrlAccess:true});}
export async function publicMailSettings(){const s=await getMailSettings();return s?{configured:true,host:s.host,port:s.port,user:s.user,from:s.from}:{configured:false};}
export async function connectMailbox(input:unknown){
 const s=settingsSchema.parse(input);const t=mailTransport(s);
 try{await t.verify();}catch{throw new UserFacingError('Mailbox connection failed. Check SMTP host, authorization/app password and whether SMTP is enabled.');}finally{t.close();}
 await fs.mkdir(dataPath(),{recursive:true});const temp=dataPath(`mail-settings-${randomUUID()}.tmp`);
 await fs.writeFile(temp,JSON.stringify(s),{mode:0o600});await fs.rename(temp,dataPath('mail-settings.json'));
 return publicMailSettings();
}
