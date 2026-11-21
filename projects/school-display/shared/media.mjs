export const defaultPhotos=['/icon.svg','/images/student-break.png','/images/student-return.png'];
export const validPhotoPath=value=>typeof value==='string'&&(defaultPhotos.includes(value)||/^\/api\/images\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(value));
export const videoSettings = ['lessonStartVideo','lessonFinishVideo','breakVideo'];
export const videoMaxBytes = 8 * 1024 * 1024;
export const validVideoPath = value => typeof value === 'string' && /^\/api\/images\/[a-f0-9]{64}\.(webm|mp4)$/.test(value);
export function imageRefs(settings,rows=[],specialDays=[]){
 const paths=['breakImage','returnImage','logoImage','lessonStartImage','lessonFinishImage','eventImage',...videoSettings].map(key=>settings[key]);
 for(const row of [...rows,...specialDays.flatMap(day=>day.schedule||[])])paths.push(row.teacherImage,row.actionImage);
 return [...new Set(paths.filter(path=>path&&!defaultPhotos.includes(path)))];
}
