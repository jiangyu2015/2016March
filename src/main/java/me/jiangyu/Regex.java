package me.jiangyu;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * jiangyukun on 2016-03-05 14:34.
 */
public class Regex {
    public static void main(String[] args) {
        String xxx = "`abcsfsdf   sdfdsf,`ccc,xfsdf";

        Pattern p  = Pattern.compile("`([^,]*),");
        Matcher m = p.matcher(xxx);

        while(m.find()) {
            String r = m.group(1);
            System.out.println("分割: " + r);
        }
    }
}
